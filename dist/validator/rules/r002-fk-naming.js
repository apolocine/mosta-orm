// R002-FK-NAMING-INCONSISTENT — détecte une convention de nommage des FKs
// incohérente *(suffixe Id mélangé avec sans-suffixe)*.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R002_FK_NAMING = {
    id: 'R002-FK-NAMING-INCONSISTENT',
    description: 'Détecte un mélange de conventions FK (parentId vs project) au sein du même set de schémas.',
    defaultSeverity: 'warning',
    apply(ctx) {
        const entityNames = new Set(ctx.schemas.map(s => s.name.toLowerCase()));
        // Rôles génériques fréquents pour des self-FK ou FK indirectes — pas hardcodé business.
        const GENERIC_FK_ROLES = new Set(['parent', 'child', 'owner', 'creator', 'author']);
        const fkFields = [];
        for (const schema of ctx.schemas) {
            for (const [fieldName, fieldDef] of Object.entries(schema.fields ?? {})) {
                if (fieldDef.type !== 'string')
                    continue;
                const lower = fieldName.toLowerCase();
                const m = /^(.+)id$/.exec(lower);
                if (m) {
                    // Suffixe Id : c'est un FK candidate si la racine est une entité OU un rôle générique.
                    const stripped = m[1];
                    if (entityNames.has(stripped) || GENERIC_FK_ROLES.has(stripped)) {
                        fkFields.push({ schema: schema.name, field: fieldName, hasSuffix: true });
                    }
                }
                else {
                    // Sans suffixe Id : c'est un FK candidate si le nom est une entité.
                    if (entityNames.has(lower)) {
                        fkFields.push({ schema: schema.name, field: fieldName, hasSuffix: false });
                    }
                }
            }
        }
        if (fkFields.length === 0)
            return [];
        const withSuffix = fkFields.filter(f => f.hasSuffix).length;
        const withoutSuffix = fkFields.length - withSuffix;
        // Convention majoritaire : si > 60% utilisent une forme, les autres sont l'anomalie.
        // Si fifty-fifty, pas de finding (laisser au dev choisir).
        const total = fkFields.length;
        const ratioWithout = withoutSuffix / total;
        if (ratioWithout < 0.55 && ratioWithout > 0.45)
            return []; // ambigu
        const majorityWithout = ratioWithout > 0.5;
        const findings = [];
        for (const fk of fkFields) {
            const isMinority = (fk.hasSuffix === majorityWithout); // suffix=true minority si majority=without
            if (!isMinority)
                continue;
            const stripped = fk.field.toLowerCase().replace(/id$/, '');
            findings.push({
                ruleId: R002_FK_NAMING.id,
                severity: R002_FK_NAMING.defaultSeverity,
                message: `'${fk.schema}.${fk.field}' utilise une convention différente de la majorité (${majorityWithout ? 'sans suffixe Id' : 'avec suffixe Id'}, ${Math.round(Math.max(ratioWithout, 1 - ratioWithout) * 100)}%).`,
                location: { schema: fk.schema, field: fk.field },
                suggestion: majorityWithout
                    ? `Renommer '${fk.field}' → '${stripped}' (sans suffixe Id, conforme à la majorité du set).`
                    : `Renommer '${fk.field}' → '${fk.field}Id' (avec suffixe Id, conforme à la majorité du set).`,
                fixable: true,
                contextDataJson: JSON.stringify({ majorityWithout, ratio: Math.max(ratioWithout, 1 - ratioWithout) }),
            });
        }
        return findings;
    },
};

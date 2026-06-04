// R006-JSON-AS-RELATION — détecte les champs *sJson qui ressemblent à des
// listes d'IDs/slugs d'entités, ce qui pourrait être normalisé en une table
// de jointure.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
const PATTERN_JSON_LIST = /^(.+?)([sS])(lugs|Lugs|Ids|IDs|ids)?Json$/;
// Singularize naïf — gère les pluriels anglais courants.
function singularize(s) {
    if (s.endsWith('ies'))
        return s.slice(0, -3) + 'y';
    if (s.endsWith('es'))
        return s.slice(0, -2);
    if (s.endsWith('s'))
        return s.slice(0, -1);
    return s;
}
export const R006_JSON_AS_RELATION = {
    id: 'R006-JSON-AS-RELATION',
    description: 'Détecte les champs *sJson contenant probablement une liste de FKs — devrait être normalisé en table de jointure.',
    defaultSeverity: 'info',
    apply(ctx) {
        const findings = [];
        const entityNames = new Set(ctx.schemas.map(s => s.name.toLowerCase()));
        for (const schema of ctx.schemas) {
            for (const [fieldName, fieldDef] of Object.entries(schema.fields ?? {})) {
                if (fieldDef.type !== 'string' && fieldDef.type !== 'json')
                    continue;
                const m = PATTERN_JSON_LIST.exec(fieldName);
                if (!m)
                    continue;
                // Extraire la racine (ex: 'templateSlugs' → 'template', 'questionIds' → 'question')
                const root = m[1].toLowerCase();
                const candidate = singularize(root);
                if (!entityNames.has(candidate))
                    continue;
                findings.push({
                    ruleId: R006_JSON_AS_RELATION.id,
                    severity: R006_JSON_AS_RELATION.defaultSeverity,
                    message: `'${schema.name}.${fieldName}' semble contenir une liste de FKs vers '${capitalize(candidate)}' — normaliser en table de jointure.`,
                    location: { schema: schema.name, field: fieldName },
                    suggestion: [
                        `Créer un schema dédié pour la relation many-to-many :`,
                        ``,
                        `  export const ${schema.name}${capitalize(candidate)}Schema: EntitySchema = {`,
                        `    name: '${schema.name}${capitalize(candidate)}',`,
                        `    collection: '${schema.collection || schema.name.toLowerCase() + 's'}_${candidate}s',`,
                        `    timestamps: true,`,
                        `    fields: { sortOrder: { type: 'number' } },`,
                        `    relations: {`,
                        `      ${schema.name.toLowerCase()}: { type: 'many-to-one', target: '${schema.name}', required: true, onDelete: 'cascade' },`,
                        `      ${candidate}: { type: 'many-to-one', target: '${capitalize(candidate)}', required: true, onDelete: 'cascade' },`,
                        `    },`,
                        `    indexes: [{ fields: { ${schema.name.toLowerCase()}: 'asc', sortOrder: 'asc' } }],`,
                        `  }`,
                        ``,
                        `Migration : pour chaque row '${schema.name}', parser ${fieldName}, créer une row par item.`,
                    ].join('\n'),
                    fixable: false,
                });
            }
        }
        return findings;
    },
};
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

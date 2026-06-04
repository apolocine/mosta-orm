// R001-EMPTY-RELATIONS — détecte les champs string qui ressemblent à des FKs
// mais n'ont pas de relation ORM déclarée.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R001_EMPTY_RELATIONS = {
    id: 'R001-EMPTY-RELATIONS',
    description: 'Détecte les champs string nommés comme une entité connue mais sans relation ORM déclarée.',
    defaultSeverity: 'warning',
    apply(ctx) {
        const findings = [];
        // Ensemble des noms d'entité (lowercase) — dérivé runtime, pas hardcodé.
        const entityNames = new Set(ctx.schemas.map(s => s.name.toLowerCase()));
        for (const schema of ctx.schemas) {
            for (const [fieldName, fieldDef] of Object.entries(schema.fields ?? {})) {
                // Heuristique : un champ string nommé exactement comme une entité existante
                // ou avec suffixe Id qui pointe sur une entité existante.
                const lower = fieldName.toLowerCase();
                const stripped = lower.replace(/id$/, '');
                const matchesEntity = entityNames.has(lower) || entityNames.has(stripped);
                if (fieldDef.type !== 'string')
                    continue;
                if (!matchesEntity)
                    continue;
                // Le champ ressemble à une FK. Y a-t-il une relation déclarée pour ce champ ?
                const hasRelation = schema.relations &&
                    (fieldName in schema.relations || stripped in schema.relations);
                if (hasRelation) {
                    // Sous-cas 1b : field FK reste dans `fields` alors qu'une relation
                    // existe → doublon, l'ORM peut traiter incohérent. Fix : retirer le field.
                    findings.push({
                        ruleId: 'R001B-FIELD-RELATION-DUPLICATE',
                        severity: 'warning',
                        message: `Champ '${schema.name}.${fieldName}' est en doublon : déclaré à la fois dans \`fields\` et \`relations\`. Retirer le field — la relation suffit.`,
                        location: { schema: schema.name, field: fieldName },
                        suggestion: `Retirer du bloc \`fields\` :\n  ${fieldName}: { type: 'string', ... }\n\nLa relation \`relations.${fieldName in (schema.relations ?? {}) ? fieldName : stripped}\` suffit.`,
                        fixable: true,
                    });
                    continue;
                }
                findings.push({
                    ruleId: R001_EMPTY_RELATIONS.id,
                    severity: R001_EMPTY_RELATIONS.defaultSeverity,
                    message: `Champ '${schema.name}.${fieldName}' ressemble à une FK vers '${capitalize(stripped)}' mais n'a pas de relation ORM déclarée.`,
                    location: { schema: schema.name, field: fieldName },
                    suggestion: buildSuggestion(schema.name, fieldName, stripped),
                    fixable: true,
                });
            }
        }
        return findings;
    },
};
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function buildSuggestion(schemaName, fieldName, targetLower) {
    const target = capitalize(targetLower);
    return [
        `Déclarer la relation au niveau \`relations\` :`,
        ``,
        `  relations: {`,
        `    ${targetLower}: { type: 'many-to-one', target: '${target}', required: true, onDelete: 'cascade' },`,
        `  },`,
        ``,
        `Et retirer le champ '${fieldName}' de \`fields\` — l'ORM le gère via la relation.`,
    ].join('\n');
}

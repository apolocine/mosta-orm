// R009-MISSING-LOOKUP-INDEX — détecte les champs marqués `unique: true` qui
// n'ont pas d'index dédié, et les champs FK qui n'ont pas d'index pour les
// lookups inverses.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R009_MISSING_LOOKUP_INDEX = {
    id: 'R009-MISSING-LOOKUP-INDEX',
    description: 'Détecte les champs unique sans index dédié et les FK sans index pour lookups inverses.',
    defaultSeverity: 'info',
    apply(ctx) {
        const findings = [];
        const entityNames = new Set(ctx.schemas.map(s => s.name.toLowerCase()));
        for (const schema of ctx.schemas) {
            const indexes = schema.indexes ?? [];
            // Set des champs présents dans au moins un index (en première position)
            const indexedFirstFields = new Set();
            for (const idx of indexes) {
                const firstField = Object.keys(idx.fields ?? {})[0];
                if (firstField)
                    indexedFirstFields.add(firstField);
            }
            for (const [fieldName, fieldDef] of Object.entries(schema.fields ?? {})) {
                const lower = fieldName.toLowerCase();
                const stripped = lower.replace(/id$/, '');
                // (a) Champ unique sans index dédié
                if (fieldDef.unique && !indexedFirstFields.has(fieldName)) {
                    // Vérifie qu'il n'y a pas un index unique composé qui commence par ce field
                    const hasUniqueIndex = indexes.some(idx => {
                        const keys = Object.keys(idx.fields ?? {});
                        return idx.unique && keys.length === 1 && keys[0] === fieldName;
                    });
                    if (!hasUniqueIndex) {
                        findings.push({
                            ruleId: R009_MISSING_LOOKUP_INDEX.id,
                            severity: R009_MISSING_LOOKUP_INDEX.defaultSeverity,
                            message: `'${schema.name}.${fieldName}' marqué unique mais sans index dédié.`,
                            location: { schema: schema.name, field: fieldName },
                            suggestion: `Ajouter \`{ fields: { ${fieldName}: 'asc' }, unique: true }\` dans \`indexes\`.`,
                            fixable: true,
                        });
                    }
                }
                // (b) FK string (ressemble à une entité) sans index → lookups inverses lents
                const matchesEntity = entityNames.has(lower) || entityNames.has(stripped);
                if (matchesEntity && fieldDef.type === 'string' && !indexedFirstFields.has(fieldName)) {
                    // Sauf s'il y a déjà un index composé qui commence par ce field
                    const hasComposite = indexes.some(idx => Object.keys(idx.fields ?? {})[0] === fieldName);
                    if (!hasComposite) {
                        findings.push({
                            ruleId: R009_MISSING_LOOKUP_INDEX.id,
                            severity: 'hint',
                            message: `FK '${schema.name}.${fieldName}' sans index dédié — lookups inverses (\`findAll({ ${fieldName}: id })\`) en table-scan.`,
                            location: { schema: schema.name, field: fieldName },
                            suggestion: `Ajouter \`{ fields: { ${fieldName}: 'asc' } }\` ou un composé \`{ fields: { ${fieldName}: 'asc', sortOrder: 'asc' } }\`.`,
                            fixable: true,
                        });
                    }
                }
            }
        }
        return findings;
    },
};

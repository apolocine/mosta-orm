// R004-DUPLICATE-ENTITY-SHAPE — détecte deux schémas dont la "forme"
// (set de champs) est très similaire → probablement un legacy/redondance.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R004_DUPLICATE_ENTITY = {
    id: 'R004-DUPLICATE-ENTITY-SHAPE',
    description: 'Détecte des paires de schémas avec un Jaccard sur les noms de champs ≥ threshold (default 0.7).',
    defaultSeverity: 'info',
    apply(ctx) {
        const threshold = ctx.options.thresholds.duplicateEntityJaccard ?? 0.7;
        const findings = [];
        for (let i = 0; i < ctx.schemas.length; i++) {
            for (let j = i + 1; j < ctx.schemas.length; j++) {
                const a = ctx.schemas[i];
                const b = ctx.schemas[j];
                const fieldsA = new Set(Object.keys(a.fields ?? {}));
                const fieldsB = new Set(Object.keys(b.fields ?? {}));
                if (fieldsA.size === 0 || fieldsB.size === 0)
                    continue;
                const inter = [...fieldsA].filter(f => fieldsB.has(f)).length;
                const union = new Set([...fieldsA, ...fieldsB]).size;
                const jaccard = inter / union;
                if (jaccard < threshold)
                    continue;
                findings.push({
                    ruleId: R004_DUPLICATE_ENTITY.id,
                    severity: R004_DUPLICATE_ENTITY.defaultSeverity,
                    message: `Schémas '${a.name}' et '${b.name}' ont un Jaccard de ${jaccard.toFixed(2)} sur leurs champs — possible legacy/redondance.`,
                    location: { schema: `${a.name}↔${b.name}` },
                    suggestion: [
                        `Vérifier si l'un des 2 est legacy/deprecated :`,
                        `  - grep les usages de '${a.name}' et '${b.name}' dans le code`,
                        `  - identifier le canonique`,
                        `  - migrer les consumers de l'autre vers le canonique`,
                        `  - supprimer le schéma legacy`,
                    ].join('\n'),
                    fixable: false,
                    contextDataJson: JSON.stringify({ jaccard, intersection: inter, union }),
                });
            }
        }
        return findings;
    },
};

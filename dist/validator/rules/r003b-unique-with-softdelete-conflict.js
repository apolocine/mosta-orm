// R003B-UNIQUE-WITH-SOFTDELETE-CONFLICT — détecte les index uniques sur un
// schema qui a aussi le soft-delete activé (natif ou pattern manuel) ET
// dont l'index n'est PAS `sparse` (partial unique en SQL).
//
// Conséquence concrète :
//
//   soft-delete d'un user[email='a@b'] → row toujours là en table avec
//   deletedAt set, mais la contrainte UNIQUE(email) refuse l'INSERT d'un
//   nouvel user[email='a@b']. UX cassée silencieusement.
//
// Suggestions :
//   - sparse: true → partial unique index `WHERE deletedAt IS NULL`
//   - OU déplacer les rows soft-deleted dans une table d'archives séparée
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R003B_UNIQUE_WITH_SOFTDELETE_CONFLICT = {
    id: 'R003B-UNIQUE-WITH-SOFTDELETE-CONFLICT',
    description: 'Détecte les index unique non-sparse sur des schémas avec soft-delete — bloque les réinsertions après soft-delete.',
    defaultSeverity: 'warning',
    apply(ctx) {
        const findings = [];
        const patterns = ctx.options.softDeletePatterns;
        for (const schema of ctx.schemas) {
            const fields = schema.fields ?? {};
            // 1. Le schema a-t-il un soft-delete actif ? (natif ou pattern manuel)
            const hasNativeSoftDelete = schema.softDelete === true;
            const manualPattern = patterns.find(p => p.flag in fields && p.timestamp in fields);
            if (!hasNativeSoftDelete && !manualPattern)
                continue;
            // 2. Pour chaque index unique non-sparse, flag.
            for (const idx of schema.indexes ?? []) {
                if (!idx.unique)
                    continue;
                if (idx.sparse === true)
                    continue; // déjà partial → OK
                const indexFieldNames = Object.keys(idx.fields ?? {});
                if (indexFieldNames.length === 0)
                    continue;
                // Ne pas flag si l'index est SUR le timestamp/flag soft-delete
                // (cas dégénéré, jamais utile en pratique mais évite faux positif).
                const sdTimestamp = manualPattern?.timestamp ?? 'deletedAt';
                const sdFlag = manualPattern?.flag;
                const allFieldsAreSdFields = indexFieldNames.every(f => f === sdTimestamp || f === sdFlag);
                if (allFieldsAreSdFields)
                    continue;
                const indexLabel = indexFieldNames.join('+');
                const fixSuggestion = [
                    `Trois options selon le besoin métier :`,
                    ``,
                    `  Option A — partial unique (recommandé sur SQL/Postgres/Mongo modernes) :`,
                    `    indexes: [`,
                    `      { fields: { ${indexFieldNames.map(f => `${f}: 'asc'`).join(', ')} }, unique: true, sparse: true },`,
                    `    ],`,
                    `    // SQL: génère 'CREATE UNIQUE INDEX ... WHERE ${sdTimestamp} IS NULL'`,
                    `    // Permet la réinsertion d'un ${indexLabel} après soft-delete du précédent.`,
                    ``,
                    `  Option B — table d'archives séparée :`,
                    `    rows soft-deleted déplacées vers '${schema.collection}_archive' à la suppression logique.`,
                    `    L'unique constraint reste stricte sur la table active.`,
                    ``,
                    `  Option C — accepter le comportement actuel (si métier exige unicité historique) :`,
                    `    ignorer cette règle pour ce schema via { ignore: ['R003B'] } dans ValidateOptions.`,
                ].join('\n');
                findings.push({
                    ruleId: R003B_UNIQUE_WITH_SOFTDELETE_CONFLICT.id,
                    severity: R003B_UNIQUE_WITH_SOFTDELETE_CONFLICT.defaultSeverity,
                    message: `Index unique \`${indexLabel}\` sur \`${schema.name}\` (soft-delete actif) sans \`sparse: true\` — ` +
                        `bloque toute réinsertion d'un row avec mêmes valeurs après soft-delete.`,
                    location: {
                        schema: schema.name,
                        field: indexFieldNames.length === 1 ? indexFieldNames[0] : indexLabel,
                    },
                    suggestion: fixSuggestion,
                    fixable: true,
                    contextDataJson: JSON.stringify({
                        schemaName: schema.name,
                        indexFields: indexFieldNames,
                        softDeleteMode: hasNativeSoftDelete ? 'native' : 'manual',
                        patternUsed: manualPattern ? { flag: manualPattern.flag, timestamp: manualPattern.timestamp } : null,
                    }),
                });
            }
        }
        return findings;
    },
};

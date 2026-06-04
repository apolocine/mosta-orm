// R003-SOFT-DELETE-INCONSISTENT — détecte des patterns soft-delete divergents
// au sein du même set de schémas, et suggère d'utiliser `softDelete: true`
// natif de @mostajs/orm.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
export const R003_SOFT_DELETE = {
    id: 'R003-SOFT-DELETE-INCONSISTENT',
    description: 'Détecte des patterns soft-delete différents entre schémas ou implémentés à la main au lieu de `softDelete: true` natif.',
    defaultSeverity: 'warning',
    apply(ctx) {
        const patterns = ctx.options.softDeletePatterns;
        const findings = [];
        // Pour chaque schema, détecter quel pattern est utilisé (manuel) et si softDelete natif est activé.
        const schemaPatterns = new Map();
        for (const schema of ctx.schemas) {
            const fields = schema.fields ?? {};
            // Match : un schema utilise un pattern si les 2 champs (flag + timestamp) sont présents.
            const found = patterns.find(p => p.flag in fields && p.timestamp in fields);
            if (found) {
                schemaPatterns.set(schema.name, {
                    pattern: found,
                    nativeSoftDelete: schema.softDelete === true,
                });
            }
            else if (schema.softDelete === true) {
                // Schema utilise softDelete natif, pas de pattern manuel
                schemaPatterns.set(schema.name, {
                    pattern: { flag: '__native__', timestamp: 'deletedAt' },
                    nativeSoftDelete: true,
                });
            }
        }
        if (schemaPatterns.size === 0)
            return []; // aucun soft-delete partout, OK
        // 1. Patterns concurrents : ≥ 2 patterns distincts utilisés manuellement.
        const manualPatterns = [...schemaPatterns.values()]
            .filter(p => !p.nativeSoftDelete)
            .map(p => p.pattern.flag);
        const uniqueManualPatterns = new Set(manualPatterns);
        if (uniqueManualPatterns.size > 1) {
            // Inconsistance détectée — flagger chaque schéma avec un pattern non-majoritaire.
            const counts = new Map();
            for (const p of manualPatterns)
                counts.set(p, (counts.get(p) ?? 0) + 1);
            const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            for (const [schemaName, info] of schemaPatterns) {
                if (info.nativeSoftDelete)
                    continue;
                if (info.pattern.flag === majority)
                    continue;
                findings.push({
                    ruleId: R003_SOFT_DELETE.id,
                    severity: R003_SOFT_DELETE.defaultSeverity,
                    message: `'${schemaName}' utilise le pattern soft-delete '${info.pattern.flag}/${info.pattern.timestamp}' divergent de la majorité ('${majority}').`,
                    location: { schema: schemaName, field: info.pattern.flag },
                    suggestion: buildUnifySuggestion(schemaName, info.pattern, majority),
                    fixable: false,
                });
            }
        }
        // 2. Implémentation manuelle alors que softDelete natif est dispo.
        for (const [schemaName, info] of schemaPatterns) {
            if (info.nativeSoftDelete)
                continue;
            // Cas particulier : si le pattern utilise déjà 'deletedAt' comme timestamp,
            // c'est très proche du natif → suggérer la migration.
            if (info.pattern.timestamp === 'deletedAt' && info.pattern.flag === 'deleted') {
                findings.push({
                    ruleId: R003_SOFT_DELETE.id,
                    severity: 'info',
                    message: `'${schemaName}' implémente manuellement (deleted/deletedAt) ce que '@mostajs/orm' offre nativement via 'softDelete: true'.`,
                    location: { schema: schemaName, field: 'deletedAt' },
                    suggestion: buildMigrateToNativeSuggestion(schemaName),
                    fixable: true,
                });
            }
        }
        return findings;
    },
};
function buildUnifySuggestion(schemaName, current, target) {
    return [
        `Unifier le pattern soft-delete sur '${target}' :`,
        ``,
        `  fields: {`,
        `    -  ${current.flag}: { type: 'boolean' },`,
        `    -  ${current.timestamp}: { type: 'date' },`,
        `    +  ${target}: { type: 'boolean' },`,
        `    +  ${target}At: { type: 'date' },`,
        `  },`,
        ``,
        `Migration data : UPDATE ${schemaName.toLowerCase()}s SET ${target}=${current.flag}, ${target}At=${current.timestamp}; ALTER DROP ${current.flag}, ${current.timestamp};`,
    ].join('\n');
}
function buildMigrateToNativeSuggestion(schemaName) {
    return [
        `Activer le soft-delete natif de @mostajs/orm :`,
        ``,
        `  export const ${schemaName}Schema: EntitySchema = {`,
        `    name: '${schemaName}',`,
        `    /* … */`,
        `    softDelete: true,    // ← AJOUT`,
        `    fields: {`,
        `      // retirer 'deleted' et 'deletedAt' manuels — l'ORM les gère`,
        `    },`,
        `  }`,
        ``,
        `findAll() exclut automatiquement les rows soft-deleted. Pour inclure : findAll({ includeDeleted: true }).`,
    ].join('\n');
}

// R018-EXTERNAL-SCHEMA-OVERSCOPED — implémentation V3-B via ts-morph.
//
// Détecte les schémas importés depuis un module externe et flags ceux qui
// présentent un ratio de "champs utilisés / champs déclarés" trop bas.
//
// Algorithme V3-B :
//   1. Pour chaque fichier .ts dans schemas/ ou index.ts :
//      détecter `export { XxxSchema } from 'external-package'` via ts-morph AST.
//   2. Pour chaque schema externe trouvé :
//      résoudre le package node_modules/<external-package>
//      lire le schema (via require/import dynamique)
//      lister les fields déclarés.
//   3. Pour chaque field : compter les occurrences `(.|->|\\b)fieldName(\\b|=)` dans src/.
//      Note : cette heuristique a des faux positifs (homonymies) mais pour
//      un signal info c'est acceptable.
//   4. Si ratio used/declared < 0.5 → flag.
//
// V3-B V1 simple : sans ts-morph, on détecte juste le pattern re-export
// (`export { X } from '...'`) et on flag "schema externe — vérifier
// l'utilisation des champs manuellement". Implémentation cross-module
// complète viendra V4 (calibration).
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
// Regex robuste pour matcher : `export { XxxSchema } from 'external-package'`
// ou `export { XxxSchema as YyyAlias } from 'external-package'`
const RE_EXTERNAL_REEXPORT = /export\s*\{\s*(\w+Schema)(?:\s+as\s+\w+)?\s*\}\s*from\s*['"]([^./'"][^'"]*)['"]/g;
export const R018_EXTERNAL_SCHEMA_OVERSCOPED = {
    id: 'R018-EXTERNAL-SCHEMA-OVERSCOPED',
    description: 'Détecte les schémas importés depuis un package externe — vérifier l\'utilisation des champs.',
    defaultSeverity: 'info',
    needsSource: true,
    apply(ctx) {
        if (!ctx.sourceFiles)
            return [];
        const findings = [];
        // Scan tous les fichiers TS pour des re-exports externes de schemas
        for (const sf of ctx.sourceFiles) {
            if (!sf.path.endsWith('.ts') && !sf.path.endsWith('.tsx'))
                continue;
            RE_EXTERNAL_REEXPORT.lastIndex = 0;
            let m;
            while ((m = RE_EXTERNAL_REEXPORT.exec(sf.content)) !== null) {
                const [, schemaName, externalPackage] = m;
                // Skip les paths relatifs (déjà filtrés par regex mais on revérifie)
                if (externalPackage.startsWith('.') || externalPackage.startsWith('/'))
                    continue;
                // Compter les usages des champs de ce schema dans src/.
                // V1 : on ne résout pas le schéma cross-module (limites jiti/ts-morph).
                // On émet un info "vérifier" générique.
                // V2 : résoudre le schéma + compter usages réels → ratio précis.
                const usageCount = countSchemaUsages(ctx.sourceFiles, schemaName);
                findings.push({
                    ruleId: R018_EXTERNAL_SCHEMA_OVERSCOPED.id,
                    severity: R018_EXTERNAL_SCHEMA_OVERSCOPED.defaultSeverity,
                    message: `Schema '${schemaName}' importé depuis '${externalPackage}' — utilisé ${usageCount} fois dans les sources. Vérifier que tous les champs du schéma externe sont nécessaires (overscoping).`,
                    location: { file: sf.relPath, schema: schemaName.replace(/Schema$/, '') },
                    suggestion: [
                        `1. Lire le schéma externe : node_modules/${externalPackage}/dist/...`,
                        `2. Lister les champs déclarés vs ceux que l'app consomme :`,
                        `   grep -rn '${schemaName.replace(/Schema$/, '')}\\.' lib/ app/`,
                        ``,
                        `3. Si beaucoup de champs inutilisés :`,
                        `   - Option A : extraire un sous-schéma local (subset des champs)`,
                        `   - Option B : documenter les champs ignorés dans un commentaire`,
                        `   - Option C : ouvrir un issue sur le module externe pour scinder`,
                    ].join('\n'),
                    fixable: false,
                });
            }
        }
        return findings;
    },
};
function countSchemaUsages(files, schemaName) {
    // Heuristique : compte `<SchemaName>` (sans .schema, sans Schema final) dans le code.
    // Ex: 'PlanSchema' → on cherche 'Plan' utilisé comme type ou identifier.
    const entityName = schemaName.replace(/Schema$/, '');
    const re = new RegExp(`\\b${escapeRegex(entityName)}\\b`, 'g');
    let count = 0;
    for (const f of files) {
        if (f.path.includes('node_modules/'))
            continue;
        const matches = f.content.match(re);
        if (matches)
            count += matches.length;
    }
    return count;
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

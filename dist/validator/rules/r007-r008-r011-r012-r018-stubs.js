// Stubs documentés pour R007, R008, R011, R012, R018 — règles cross-file
// complexes nécessitant un parsing AST (ts-morph). En V2 simple, on
// implémente avec des regex robustes ; AST viendra en V3.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>
// ─── R007-REDUNDANT-DERIVED-FIELD (regex-based MVP) ────────────────
const RE_FUNC_OF_ID = /export\s+function\s+(\w+)\s*\(\s*(\w+)\s*:\s*string\s*\)\s*:\s*string\s*\{[^}]*?return[^}]*?\b\2\b/g;
export const R007_REDUNDANT_DERIVED_FIELD = {
    id: 'R007-REDUNDANT-DERIVED-FIELD',
    description: 'Détecte les champs persistés qui sont déjà dérivables par une fonction pure de leur id.',
    defaultSeverity: 'info',
    needsSource: true,
    apply(ctx) {
        if (!ctx.sourceFiles)
            return [];
        const findings = [];
        // 1. Scan sources pour les fonctions `f(id: string): string` qui retournent une valeur dérivée.
        const derivedFuncs = new Map(); // funcName → file
        for (const sf of ctx.sourceFiles) {
            RE_FUNC_OF_ID.lastIndex = 0;
            let m;
            while ((m = RE_FUNC_OF_ID.exec(sf.content)) !== null) {
                derivedFuncs.set(m[1], sf.relPath);
            }
        }
        // 2. Pour chaque schema, regarde si un field nommé comme une fonction dérivée existe.
        //    ex: archiveBlobPath(id) → champ blobPath sur Archive → potentiellement redondant.
        for (const schema of ctx.schemas) {
            for (const fieldName of Object.keys(schema.fields ?? {})) {
                // Pattern : fonction `<schemaName>${fieldName}(id)` ou `${fieldName}Path(id)`, etc.
                for (const [funcName, file] of derivedFuncs) {
                    const lcFunc = funcName.toLowerCase();
                    if (lcFunc.includes(fieldName.toLowerCase()) ||
                        lcFunc.includes(schema.name.toLowerCase() + fieldName.toLowerCase())) {
                        findings.push({
                            ruleId: R007_REDUNDANT_DERIVED_FIELD.id,
                            severity: 'info',
                            message: `Champ '${schema.name}.${fieldName}' semble dérivable par la fonction \`${funcName}(id)\` (${file}).`,
                            location: { schema: schema.name, field: fieldName, file },
                            suggestion: `Vérifier si le champ peut être supprimé et la valeur dérivée runtime via \`${funcName}(row.id)\`.`,
                            fixable: false,
                        });
                    }
                }
            }
        }
        return findings;
    },
};
// ─── R008-BEST-EFFORT-FK-RESOLVER ────────────────────────────────
const RE_BEST_EFFORT_COMMENT = /(\/\/|\/\*)\s*(best[- ]?effort|TODO.*V2|HACK|FIXME|XXX)/i;
const RE_FALLBACK_NULL = /\?\?\s*null|\?\?\s*Object\.values\(/;
export const R008_BEST_EFFORT_RESOLVER = {
    id: 'R008-BEST-EFFORT-FK-RESOLVER',
    description: 'Détecte les fonctions de résolution FK marquées best-effort/TODO/HACK avec fallback null.',
    defaultSeverity: 'warning',
    needsSource: true,
    apply(ctx) {
        if (!ctx.sourceFiles)
            return [];
        const findings = [];
        for (const sf of ctx.sourceFiles) {
            const lines = sf.content.split('\n');
            // Cherche par chunks de 8 lignes — un commentaire + un fallback dans la même portion = match
            for (let i = 0; i < lines.length; i++) {
                const chunk = lines.slice(i, i + 8).join('\n');
                if (RE_BEST_EFFORT_COMMENT.test(chunk) && RE_FALLBACK_NULL.test(chunk)) {
                    // Trouver la ligne du commentaire pour la précision
                    const commentLine = lines.slice(i, i + 8).findIndex(l => RE_BEST_EFFORT_COMMENT.test(l));
                    findings.push({
                        ruleId: R008_BEST_EFFORT_RESOLVER.id,
                        severity: R008_BEST_EFFORT_RESOLVER.defaultSeverity,
                        message: `Code "best-effort" avec fallback détecté dans ${sf.relPath}.`,
                        location: { file: sf.relPath, line: i + 1 + (commentLine >= 0 ? commentLine : 0) },
                        suggestion: `Identifier la cause racine et la corriger. Un fallback masqué laisse des FKs invalides.`,
                        fixable: false,
                    });
                    i += 8; // skip pour éviter doublons sur le même bloc
                }
            }
        }
        return findings;
    },
};
// ─── R011-LEGACY-DEAD-CODE (regex-based MVP) ──────────────────────
export const R011_LEGACY_DEAD_CODE = {
    id: 'R011-LEGACY-DEAD-CODE',
    description: 'Détecte les fichiers TS qui ne sont importés nulle part.',
    defaultSeverity: 'info',
    needsSource: true,
    apply(ctx) {
        if (!ctx.sourceFiles)
            return [];
        const findings = [];
        // Index : pour chaque fichier, quel est son basename sans extension ?
        const files = ctx.sourceFiles.filter(sf => sf.path.endsWith('.ts') || sf.path.endsWith('.tsx'));
        const fileByBasename = new Map(); // 'questions' → 'lib/questions.ts'
        for (const sf of files) {
            const segments = sf.relPath.split('/');
            const last = segments[segments.length - 1];
            const base = last.replace(/\.tsx?$/, '');
            // Skip Next.js entry points qui n'ont jamais d'import explicite
            if (['page', 'layout', 'route', 'loading', 'error', 'not-found', 'index'].includes(base))
                continue;
            fileByBasename.set(base, sf.relPath);
        }
        for (const [basename, relPath] of fileByBasename) {
            // Pattern import : `from '...basename'` (avec ou sans extension)
            const pattern = new RegExp(`from\\s+['"][^'"]*\\b${escapeRegex(basename)}(\\.tsx?|\\.js)?['"]`, 'g');
            let usedByCount = 0;
            for (const sf of files) {
                if (sf.relPath === relPath)
                    continue;
                pattern.lastIndex = 0;
                if (pattern.test(sf.content)) {
                    usedByCount++;
                    if (usedByCount > 0)
                        break;
                }
            }
            if (usedByCount === 0) {
                findings.push({
                    ruleId: R011_LEGACY_DEAD_CODE.id,
                    severity: R011_LEGACY_DEAD_CODE.defaultSeverity,
                    message: `Fichier '${relPath}' n'est importé par aucun autre fichier source.`,
                    location: { file: relPath },
                    suggestion: `Vérifier l'utilisation (peut-être chargé dynamiquement ou via API). Si dead code : supprimer.`,
                    fixable: false,
                });
            }
        }
        return findings;
    },
};
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ─── R012-DUPLICATE-IMPLEMENTATION ────────────────────────────────
export const R012_DUPLICATE_IMPLEMENTATION = {
    id: 'R012-DUPLICATE-IMPLEMENTATION',
    description: 'Détecte des paires de fichiers source dont les signatures de fonctions exportées se chevauchent fortement.',
    defaultSeverity: 'info',
    needsSource: true,
    apply(ctx) {
        if (!ctx.sourceFiles)
            return [];
        const threshold = ctx.options.thresholds.duplicateImplJaroWinkler ?? 0.85;
        const findings = [];
        const RE_EXPORT_FN = /export\s+(?:async\s+)?function\s+(\w+)/g;
        const fileSignatures = new Map();
        for (const sf of ctx.sourceFiles) {
            if (!sf.path.endsWith('.ts') && !sf.path.endsWith('.tsx'))
                continue;
            const sigs = [];
            let m;
            RE_EXPORT_FN.lastIndex = 0;
            while ((m = RE_EXPORT_FN.exec(sf.content)) !== null)
                sigs.push(m[1]);
            if (sigs.length >= 2)
                fileSignatures.set(sf.relPath, sigs);
        }
        const files = [...fileSignatures.keys()];
        for (let i = 0; i < files.length; i++) {
            for (let j = i + 1; j < files.length; j++) {
                const a = fileSignatures.get(files[i]);
                const b = fileSignatures.get(files[j]);
                const aSet = new Set(a);
                const bSet = new Set(b);
                const inter = [...aSet].filter(s => bSet.has(s)).length;
                const union = new Set([...aSet, ...bSet]).size;
                const jaccardSig = inter / union;
                if (jaccardSig >= threshold) {
                    findings.push({
                        ruleId: R012_DUPLICATE_IMPLEMENTATION.id,
                        severity: R012_DUPLICATE_IMPLEMENTATION.defaultSeverity,
                        message: `'${files[i]}' et '${files[j]}' exportent ${inter} fonctions identiques sur ${union} totales (Jaccard ${jaccardSig.toFixed(2)}).`,
                        location: { file: `${files[i]} ↔ ${files[j]}` },
                        suggestion: `Vérifier la duplication d'implémentation. Fusionner ou clarifier les rôles distincts.`,
                        fixable: false,
                    });
                }
            }
        }
        return findings;
    },
};
// R018-EXTERNAL-SCHEMA-OVERSCOPED — implémentation déplacée vers
// `./r018-external-schema.ts` (V3-B). Re-export pour rétro-compatibilité.
export { R018_EXTERNAL_SCHEMA_OVERSCOPED } from './r018-external-schema.js';

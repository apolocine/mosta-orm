// @mostajs/orm/validator — fixer (auto-fix via AST)
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Implémente l'auto-correction des findings `fixable: true` via ts-morph.
//
// Règles supportées V3-A V1 :
//   R013-MISSING-CASCADE          — ajoute onDelete: 'cascade' aux relations m2o
//   R009-MISSING-LOOKUP-INDEX     — ajoute un index dédié manquant
//
// Règles avec implémentation partielle (suggestion textuelle seulement) :
//   R001-EMPTY-RELATIONS          — nécessite refactor cross-file (consumers)
//   R002-FK-NAMING                — rename cross-file
//   R016-AUDIT-EMAIL-AS-STRING    — conversion field → relation
//
// Mode :
//   - dryRun=true (default) : génère un diff unifié, n'écrit rien
//   - dryRun=false           : applique les modifications + backup .bak
import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, statSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Project } from 'ts-morph';
export async function applyFixes(report, opts) {
    const dryRun = opts.dryRun !== false; // dry-run par défaut
    const allowedRules = opts.rules;
    const backup = opts.backup !== false;
    // 1. Charger le projet TS via ts-morph
    const project = new Project({
        // Pas de tsconfig — on lit les sources brutes ; le compileur n'a pas
        // besoin du paths/aliases pour modifier la syntaxe locale.
        useInMemoryFileSystem: false,
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
        skipLoadingLibFiles: true,
    });
    // 2. Trouver tous les fichiers schéma dans sourceRoot
    const schemaFiles = findSchemaFiles(opts.sourceRoot);
    for (const f of schemaFiles) {
        project.addSourceFileAtPathIfExists(f);
    }
    // 2bis. Charger aussi les fichiers consumer cités explicitement par les
    // findings cross-file (R019/R021). Évite de re-scanner tout l'arbre.
    for (const f of report.findings) {
        if (!f.fixable)
            continue;
        if (!f.location.file)
            continue;
        const abs = resolve(opts.sourceRoot, f.location.file);
        if (!project.getSourceFile(abs)) {
            project.addSourceFileAtPathIfExists(abs);
        }
    }
    const results = [];
    // 3. Group les findings par fichier + règle
    const findingsByFile = new Map();
    for (const f of report.findings) {
        if (!f.fixable)
            continue;
        if (allowedRules && !allowedRules.some(r => f.ruleId.startsWith(r)))
            continue;
        // Localiser le fichier : si location.file présent, l'utiliser ; sinon, chercher dans schemaFiles
        let file = f.location.file ? resolve(opts.sourceRoot, f.location.file) : null;
        if (!file && f.location.schema) {
            file = locateSchemaFile(schemaFiles, f.location.schema) ?? null;
        }
        if (!file) {
            results.push({
                ruleId: f.ruleId, schema: f.location.schema ?? '?', field: f.location.field,
                file: '?', applied: false, reason: 'fichier source introuvable',
                description: f.message,
            });
            continue;
        }
        if (!findingsByFile.has(file))
            findingsByFile.set(file, []);
        findingsByFile.get(file).push(f);
    }
    // 4. Pour chaque fichier, appliquer toutes les fixes en une passe (puis save)
    for (const [filePath, findings] of findingsByFile) {
        const sf = project.getSourceFile(filePath);
        if (!sf) {
            for (const f of findings) {
                results.push({
                    ruleId: f.ruleId, schema: f.location.schema ?? '?', field: f.location.field,
                    file: filePath, applied: false, reason: 'fichier non chargé par ts-morph',
                    description: f.message,
                });
            }
            continue;
        }
        const originalText = sf.getFullText();
        // Cascade ts-morph mitigation : entre chaque fix, on rafraîchit le
        // SourceFile via remove+create pour repartir avec un AST frais. Évite
        // les "node forgotten" quand plusieurs schemas dans le même fichier
        // ou plusieurs fixes sur le même schema.
        let currentSf = sf;
        for (const f of findings) {
            let applied;
            try {
                applied = await tryApplyFix(currentSf, f);
            }
            catch (e) {
                applied = { ok: false, reason: `internal fixer error: ${e.message.slice(0, 120)}` };
            }
            results.push({
                ruleId: f.ruleId,
                schema: f.location.schema ?? '?',
                field: f.location.field,
                file: filePath,
                applied: applied.ok,
                reason: applied.reason,
                description: f.message,
            });
            // Refresh AST pour le prochain fix : récupère le texte modifié et
            // recrée le SourceFile à partir de ce texte (in-memory, pas de save FS).
            if (applied.ok) {
                const text = currentSf.getFullText();
                project.removeSourceFile(currentSf);
                currentSf = project.createSourceFile(filePath, text, { overwrite: true });
            }
        }
        // Récupère le source courant (après cycles remove+create)
        const finalSf = project.getSourceFile(filePath) ?? currentSf;
        const newText = finalSf.getFullText();
        if (newText !== originalText) {
            // Diff pour le rapport (toujours)
            for (const r of results) {
                if (r.file === filePath && !r.diff)
                    r.diff = unifiedDiff(filePath, originalText, newText);
            }
            // Écriture si non dry-run
            if (!dryRun) {
                if (backup) {
                    try {
                        copyFileSync(filePath, filePath + '.bak');
                    }
                    catch { /* ignore */ }
                }
                writeFileSync(filePath, newText, 'utf-8');
            }
        }
    }
    return results;
}
// ─── Dispatcher par règle ─────────────────────────────────────────
async function tryApplyFix(sf, finding) {
    const ruleId = finding.ruleId;
    // R001B (doublon field/relation) → simple remove du field
    if (ruleId.startsWith('R001B') || ruleId === 'R001B-FIELD-RELATION-DUPLICATE') {
        return fixR001B_FieldRelationDuplicate(sf, finding);
    }
    if (ruleId.startsWith('R001'))
        return fixR001_EmptyRelations(sf, finding);
    if (ruleId.startsWith('R002'))
        return fixR002_FkNaming(sf, finding);
    if (ruleId === 'R003B-UNIQUE-WITH-SOFTDELETE-CONFLICT')
        return fixR003B_UniqueWithSoftDelete(sf, finding);
    if (ruleId.startsWith('R003'))
        return fixR003_SoftDeleteNative(sf, finding);
    if (ruleId === 'R013B-EAGER-WITHOUT-CASCADE')
        return fixR013B_EagerWithoutCascade(sf, finding);
    if (ruleId.startsWith('R013'))
        return fixR013_MissingCascade(sf, finding);
    if (ruleId.startsWith('R009'))
        return fixR009_MissingIndex(sf, finding);
    if (ruleId.startsWith('R016'))
        return fixR016_AuditEmailAsString(sf, finding);
    if (ruleId === 'R019-FINDBYID-OBJECT-INPUT')
        return fixR019_FindByIdObjectInput(sf, finding);
    if (ruleId === 'R021-DIRECT-RELATION-COMPARISON')
        return fixR021_DirectRelationComparison(sf, finding);
    return { ok: false, reason: `Auto-fix de ${ruleId} non implémenté` };
}
// ─── R003B — ajouter `sparse: true` à l'index unique ──────────────
function fixR003B_UniqueWithSoftDelete(sf, finding) {
    const ctx = parseFindingContext(finding);
    if (!ctx?.schemaName || !Array.isArray(ctx.indexFields)) {
        return { ok: false, reason: 'contextDataJson invalide' };
    }
    const schemaName = ctx.schemaName;
    const indexFields = ctx.indexFields.slice().sort().join('|');
    const schemaObj = findSchemaObjectLiteral(sf, schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${schemaName}' introuvable` };
    const indexesProp = schemaObj.getProperty('indexes');
    const indexesInit = indexesProp?.getInitializer();
    if (!indexesInit || indexesInit.getKindName() !== 'ArrayLiteralExpression') {
        return { ok: false, reason: 'indexes: [...] introuvable' };
    }
    const arr = indexesInit;
    const elements = arr.getElements();
    for (const el of elements) {
        if (el.getKindName() !== 'ObjectLiteralExpression')
            continue;
        const obj = el;
        const fieldsProp = obj.getProperty('fields');
        const uniqueProp = obj.getProperty('unique');
        if (!fieldsProp || !uniqueProp)
            continue;
        if (uniqueProp.getInitializer()?.getText() !== 'true')
            continue;
        const fieldsInit = fieldsProp.getInitializer();
        if (!fieldsInit || fieldsInit.getKindName() !== 'ObjectLiteralExpression')
            continue;
        const fieldsObj = fieldsInit;
        const declaredFields = fieldsObj.getProperties()
            .filter(p => p.getKindName() === 'PropertyAssignment')
            .map(p => {
            const pa = p;
            const nn = pa.getNameNode();
            return nn.getKindName() === 'Identifier' ? nn.getText() : nn.getText().replace(/['"]/g, '');
        })
            .slice()
            .sort()
            .join('|');
        if (declaredFields !== indexFields)
            continue;
        // Index trouvé. Idempotent : sparse déjà true → no-op.
        const sparseProp = obj.getProperty('sparse');
        if (sparseProp) {
            if (sparseProp.getInitializer()?.getText() === 'true')
                return { ok: true };
            sparseProp.setInitializer('true');
            return { ok: true };
        }
        obj.addPropertyAssignment({ name: 'sparse', initializer: 'true' });
        return { ok: true };
    }
    return { ok: false, reason: `index unique sur (${ctx.indexFields.join(', ')}) introuvable` };
}
// ─── R013B — ajouter `onDelete` à la relation eager ───────────────
function fixR013B_EagerWithoutCascade(sf, finding) {
    const ctx = parseFindingContext(finding);
    if (!ctx?.schemaName || !ctx?.relationName || !ctx?.suggestedOnDelete) {
        return { ok: false, reason: 'contextDataJson invalide' };
    }
    const schemaObj = findSchemaObjectLiteral(sf, ctx.schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${ctx.schemaName}' introuvable` };
    const relationsProp = schemaObj.getProperty('relations');
    const relationsInit = relationsProp?.getInitializer();
    if (!relationsInit || relationsInit.getKindName() !== 'ObjectLiteralExpression') {
        return { ok: false, reason: 'relations: {...} introuvable' };
    }
    const relations = relationsInit;
    const relProp = relations.getProperty(ctx.relationName);
    if (!relProp)
        return { ok: false, reason: `relation '${ctx.relationName}' introuvable` };
    const relDef = relProp.getInitializer();
    if (!relDef || relDef.getKindName() !== 'ObjectLiteralExpression') {
        return { ok: false, reason: 'relation def n\'est pas un object literal' };
    }
    const relObj = relDef;
    const existing = relObj.getProperty('onDelete');
    if (existing)
        return { ok: true }; // idempotent
    relObj.addPropertyAssignment({
        name: 'onDelete',
        initializer: `'${ctx.suggestedOnDelete}'`,
    });
    return { ok: true };
}
// ─── R019 / R021 — cross-file consumer code ───────────────────────
function fixR019_FindByIdObjectInput(sf, finding) {
    const ctx = parseFindingContext(finding);
    if (!ctx?.originalCall || !ctx?.suggestedReplacement) {
        return { ok: false, reason: 'contextDataJson invalide (originalCall/suggestedReplacement absents)' };
    }
    return applyTextReplacement(sf, ctx.originalCall, ctx.suggestedReplacement);
}
function fixR021_DirectRelationComparison(sf, finding) {
    const ctx = parseFindingContext(finding);
    if (!ctx?.originalExpression || !ctx?.suggestedExpression) {
        return { ok: false, reason: 'contextDataJson invalide (originalExpression/suggestedExpression absents)' };
    }
    return applyTextReplacement(sf, ctx.originalExpression, ctx.suggestedExpression);
}
/**
 * Remplace la première occurrence de `oldText` par `newText` dans `sf`, et
 * s'assure que `extractRelId` est importé depuis `@mostajs/orm`.
 *
 * Idempotent :
 *   - si `oldText` n'existe plus mais `newText` est présent → ok (déjà fait)
 *   - si l'import existe déjà → no-op pour l'import
 */
function applyTextReplacement(sf, oldText, newText) {
    const fullText = sf.getFullText();
    // Idempotence : si déjà appliqué (newText présent et oldText absent OU
    // newText présent à la place attendue), on s'assure juste de l'import.
    if (!fullText.includes(oldText) && fullText.includes(newText)) {
        return ensureExtractRelIdImport(sf);
    }
    const idx = fullText.indexOf(oldText);
    if (idx < 0) {
        return { ok: false, reason: `expression originale introuvable dans le fichier : ${oldText.slice(0, 60)}…` };
    }
    sf.replaceText([idx, idx + oldText.length], newText);
    return ensureExtractRelIdImport(sf);
}
/**
 * Garantit qu'`extractRelId` est importable depuis `@mostajs/orm`. Trois cas :
 *   1. Import nommé déjà présent → no-op
 *   2. Autre import depuis '@mostajs/orm' présent (ex: `{ BaseRepository }`)
 *      → on ajoute `extractRelId` à la liste nommée
 *   3. Aucun import depuis '@mostajs/orm' → on insère une nouvelle ligne
 *      d'import en tête de fichier, après les éventuels imports existants
 *      (pour ne pas casser la convention 'imports en haut').
 */
function ensureExtractRelIdImport(sf) {
    const importDecls = sf.getImportDeclarations();
    const targetMod = '@mostajs/orm';
    for (const imp of importDecls) {
        if (imp.getModuleSpecifierValue() !== targetMod)
            continue;
        const namedImports = imp.getNamedImports();
        if (namedImports.some(n => n.getName() === 'extractRelId')) {
            return { ok: true }; // cas 1
        }
        imp.addNamedImport('extractRelId'); // cas 2
        return { ok: true };
    }
    // cas 3 — pas d'import depuis @mostajs/orm
    const allImports = sf.getImportDeclarations();
    if (allImports.length > 0) {
        const last = allImports[allImports.length - 1];
        sf.insertImportDeclaration(last.getChildIndex() + 1, {
            namedImports: ['extractRelId'],
            moduleSpecifier: targetMod,
        });
    }
    else {
        sf.insertImportDeclaration(0, {
            namedImports: ['extractRelId'],
            moduleSpecifier: targetMod,
        });
    }
    return { ok: true };
}
/** Helper : parse contextDataJson en objet. Retourne null si invalide. */
function parseFindingContext(finding) {
    if (!finding.contextDataJson)
        return null;
    try {
        return JSON.parse(finding.contextDataJson);
    }
    catch {
        // scan-ignore: fallback documenté dans le JSDoc — null = JSON invalide (sentinelle)
        return null;
    }
}
// ─── R003 — migrer (deleted/deletedAt) manuel vers softDelete natif ──
function fixR003_SoftDeleteNative(sf, finding) {
    const schemaName = finding.location.schema;
    if (!schemaName)
        return { ok: false, reason: 'schema manquant' };
    // On ne fixe que le sous-cas "migrer deleted/deletedAt → softDelete natif"
    // (R003 severity=info). Les patterns divergents (cancelled/etc.) restent
    // suggestion textuelle — décision métier.
    if (finding.severity !== 'info') {
        return { ok: false, reason: 'R003 warning (pattern divergent) nécessite décision métier — non auto-fixable' };
    }
    const schemaObj = findSchemaObjectLiteral(sf, schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${schemaName}' introuvable` };
    // 1. Ajouter `softDelete: true` au schema (idempotent)
    if (!schemaObj.getProperty('softDelete')) {
        schemaObj.addPropertyAssignment({ name: 'softDelete', initializer: 'true' });
    }
    // 2. Retirer `deleted` + `deletedAt` du bloc fields via fallback textuel
    // (gère les commentaires en fin de ligne).
    const r1 = removeFieldFromSchemaText(sf, schemaName, 'deleted');
    if (!r1.ok && !/déjà retiré|introuvable dans fields/.test(r1.reason ?? ''))
        return r1;
    const r2 = removeFieldFromSchemaText(sf, schemaName, 'deletedAt');
    if (!r2.ok && !/déjà retiré|introuvable dans fields/.test(r2.reason ?? ''))
        return r2;
    return { ok: true };
}
// ─── R001B — retire le field redondant qui duplique une relation ──
function fixR001B_FieldRelationDuplicate(sf, finding) {
    const schemaName = finding.location.schema;
    const fieldName = finding.location.field;
    if (!schemaName || !fieldName)
        return { ok: false, reason: 'schema/field manquant' };
    // Tentative ts-morph (échoue souvent si commentaire en fin de ligne)
    try {
        const schemaObj = findSchemaObjectLiteral(sf, schemaName);
        if (schemaObj) {
            const fieldsProp = schemaObj.getProperty('fields');
            const fieldsObj = fieldsProp?.getInitializer();
            if (fieldsObj && fieldsObj.getKindName() === 'ObjectLiteralExpression') {
                const fields = fieldsObj;
                const fkField = fields.getProperty(fieldName);
                if (!fkField)
                    return { ok: false, reason: `champ '${fieldName}' déjà retiré` };
                fkField.remove();
                return { ok: true };
            }
        }
    }
    catch {
        // scan-ignore: fallback textuel intentionnel quand l'AST refuse — voir removeFieldFromSchemaText
    }
    return removeFieldFromSchemaText(sf, schemaName, fieldName);
}
/**
 * Fallback textuel pour retirer un field d'un schema. Robuste face aux
 * commentaires en fin de ligne (que ts-morph remove() casse en SyntaxList).
 */
function removeFieldFromSchemaText(sf, schemaName, fieldName) {
    const text = sf.getFullText();
    const schemaStart = text.indexOf(`${schemaName}Schema`);
    if (schemaStart < 0)
        return { ok: false, reason: `schema '${schemaName}' introuvable dans le texte` };
    const nextExport = text.indexOf('export const', schemaStart + 1);
    const schemaSlice = text.slice(schemaStart, nextExport > 0 ? nextExport : text.length);
    const fieldsOpenRel = schemaSlice.indexOf('fields:');
    if (fieldsOpenRel < 0)
        return { ok: false, reason: 'fields: introuvable' };
    const fieldsOpenAbs = schemaStart + fieldsOpenRel;
    const braceOpen = text.indexOf('{', fieldsOpenAbs);
    let depth = 1;
    let braceClose = braceOpen;
    for (let i = braceOpen + 1; i < text.length && depth > 0; i++) {
        if (text[i] === '{')
            depth++;
        else if (text[i] === '}')
            depth--;
        if (depth === 0) {
            braceClose = i;
            break;
        }
    }
    const fieldsBlock = text.slice(braceOpen + 1, braceClose);
    const lineRe = new RegExp(`^\\s*${fieldName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*:\\s*\\{[^}]*\\}\\s*,?\\s*(?:\\/\\/[^\\n]*)?\\n`, 'm');
    const m = fieldsBlock.match(lineRe);
    if (!m)
        return { ok: false, reason: `ligne '${fieldName}:' introuvable dans fields` };
    const newFieldsBlock = fieldsBlock.replace(lineRe, '');
    const newText = text.slice(0, braceOpen + 1) + newFieldsBlock + text.slice(braceClose);
    sf.replaceWithText(newText);
    return { ok: true };
}
// ─── R001 — replace FK string field with relations m2o ──────────
function fixR001_EmptyRelations(sf, finding) {
    const schemaName = finding.location.schema;
    const fieldName = finding.location.field;
    if (!schemaName || !fieldName)
        return { ok: false, reason: 'schema/field manquant' };
    const schemaObj = findSchemaObjectLiteral(sf, schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${schemaName}' introuvable` };
    // 1. Retirer le field FK des `fields: { ... }`
    const fieldsProp = schemaObj.getProperty('fields');
    if (!fieldsProp)
        return { ok: false, reason: 'pas de bloc `fields`' };
    const fieldsObj = fieldsProp.getInitializer();
    if (!fieldsObj || fieldsObj.getKindName() !== 'ObjectLiteralExpression') {
        return { ok: false, reason: 'fields pas un object literal' };
    }
    const fields = fieldsObj;
    const fkField = fields.getProperty(fieldName);
    if (!fkField)
        return { ok: false, reason: `champ '${fieldName}' introuvable` };
    // Vérifier que ce field est bien une string (sanity)
    const fkInit = fkField.getInitializer();
    if (fkInit?.getKindName() === 'ObjectLiteralExpression') {
        const typeProp = fkInit.getProperty('type');
        const typeText = typeProp?.getInitializer()?.getText();
        if (typeText && !typeText.includes("'string'") && !typeText.includes('"string"')) {
            return { ok: false, reason: `champ '${fieldName}' n'est pas type string (${typeText})` };
        }
    }
    // 2. S'assurer que `relations: { ... }` existe (créer sinon)
    let relationsProp = schemaObj.getProperty('relations');
    if (!relationsProp) {
        schemaObj.addPropertyAssignment({ name: 'relations', initializer: `{}` });
        relationsProp = schemaObj.getProperty('relations');
    }
    const relationsInit = relationsProp.getInitializer();
    if (!relationsInit || relationsInit.getKindName() !== 'ObjectLiteralExpression') {
        return { ok: false, reason: 'relations pas un object literal' };
    }
    const relations = relationsInit;
    // Pas écraser une relation déjà présente
    const targetName = fieldName.toLowerCase().replace(/id$/, '');
    if (relations.getProperty(targetName)) {
        return { ok: false, reason: `relation '${targetName}' déjà déclarée` };
    }
    // Inférer le target depuis le field name
    const target = capitalize(targetName);
    const isRequired = isFieldRequired(fkField);
    // 3. Ajouter la relation
    relations.addPropertyAssignment({
        name: targetName,
        initializer: `{ type: 'many-to-one', target: '${target}'${isRequired ? ', required: true' : ''}, onDelete: 'cascade' }`,
    });
    // 4. Retirer le field FK des `fields`
    fkField.remove();
    return { ok: true };
}
function isFieldRequired(fieldProp) {
    const init = fieldProp.getInitializer();
    if (init?.getKindName() !== 'ObjectLiteralExpression')
        return false;
    const reqProp = init.getProperty('required');
    return reqProp?.getInitializer()?.getText() === 'true';
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
// ─── R002 — rename FK field (schema-side seulement, V3-A V2 V1) ──
function fixR002_FkNaming(sf, finding) {
    const schemaName = finding.location.schema;
    const fieldName = finding.location.field;
    if (!schemaName || !fieldName)
        return { ok: false, reason: 'schema/field manquant' };
    // On lit la suggestion via contextDataJson pour savoir si majorité est "sans Id"
    let majorityWithout = true;
    if (finding.contextDataJson) {
        // scan-ignore: fallback explicite — majorityWithout reste à `true` (default) si JSON invalide
        try {
            majorityWithout = JSON.parse(finding.contextDataJson).majorityWithout !== false;
        }
        catch { }
    }
    const newName = majorityWithout
        ? fieldName.replace(/Id$/, '')
        : (fieldName.endsWith('Id') ? fieldName : fieldName + 'Id');
    if (newName === fieldName)
        return { ok: false, reason: 'no rename needed' };
    const schemaObj = findSchemaObjectLiteral(sf, schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${schemaName}' introuvable` };
    const fieldsProp = schemaObj.getProperty('fields');
    if (!fieldsProp)
        return { ok: false, reason: 'pas de bloc `fields`' };
    const fields = fieldsProp.getInitializer();
    const fieldProp = fields.getProperty(fieldName);
    if (!fieldProp)
        return { ok: false, reason: `champ '${fieldName}' introuvable` };
    // Conflit potentiel
    if (fields.getProperty(newName)) {
        return { ok: false, reason: `'${newName}' existe déjà dans fields` };
    }
    fieldProp.rename(newName);
    // Ajouter un commentaire pour rappeler le refactor cross-file
    fieldProp.getFirstAncestorByKind?.(254); // VariableDeclaration ignore
    return { ok: true, reason: `Renommé dans le schéma. NOTE : mettre à jour les usages cross-file (lib/, app/) : \`${fieldName}\` → \`${newName}\`.` };
}
// ─── R016 — convert string audit field to relation User ──────────
function fixR016_AuditEmailAsString(sf, finding) {
    const schemaName = finding.location.schema;
    const fieldName = finding.location.field;
    if (!schemaName || !fieldName)
        return { ok: false, reason: 'schema/field manquant' };
    const schemaObj = findSchemaObjectLiteral(sf, schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${schemaName}' introuvable` };
    const fieldsProp = schemaObj.getProperty('fields');
    if (!fieldsProp)
        return { ok: false, reason: 'pas de bloc `fields`' };
    const fields = fieldsProp.getInitializer();
    const auditField = fields.getProperty(fieldName);
    if (!auditField)
        return { ok: false, reason: `champ '${fieldName}' introuvable` };
    // S'assurer que `relations` existe
    let relationsProp = schemaObj.getProperty('relations');
    if (!relationsProp) {
        schemaObj.addPropertyAssignment({ name: 'relations', initializer: `{}` });
        relationsProp = schemaObj.getProperty('relations');
    }
    const relations = relationsProp.getInitializer();
    if (relations.getProperty(fieldName)) {
        return { ok: false, reason: `relation '${fieldName}' déjà déclarée` };
    }
    // Ajouter relation User (on-delete: set-null pour préserver l'audit historique)
    relations.addPropertyAssignment({
        name: fieldName,
        initializer: `{ type: 'many-to-one', target: 'User', onDelete: 'set-null' }`,
    });
    auditField.remove();
    return { ok: true, reason: `Champ converti en relation many-to-one User. NOTE : mettre à jour les usages cross-file qui assignent l'email (\`${fieldName}: email\`) — l'ORM attend désormais un User id.` };
}
// ─── R013 — add onDelete: 'cascade' to relation ──────────────────
function fixR013_MissingCascade(sf, finding) {
    const schemaName = finding.location.schema;
    const relName = finding.location.field;
    if (!schemaName || !relName)
        return { ok: false, reason: 'schema/field manquant dans le finding' };
    const schemaObj = findSchemaObjectLiteral(sf, schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${schemaName}' introuvable dans ${sf.getBaseName()}` };
    // Trouver `relations: { … }`
    const relationsProp = schemaObj.getProperty('relations');
    if (!relationsProp)
        return { ok: false, reason: 'pas de bloc `relations` à modifier' };
    const relationsObj = relationsProp.getInitializer();
    if (!relationsObj || relationsObj.getKindName() !== 'ObjectLiteralExpression') {
        return { ok: false, reason: 'relations n\'est pas un object literal' };
    }
    const relations = relationsObj;
    // Trouver la propriété correspondant au relName
    const relProp = relations.getProperty(relName);
    if (!relProp)
        return { ok: false, reason: `relation '${relName}' introuvable` };
    const relInitializer = relProp.getInitializer();
    if (!relInitializer || relInitializer.getKindName() !== 'ObjectLiteralExpression') {
        return { ok: false, reason: 'relation n\'est pas un object literal' };
    }
    const relObj = relInitializer;
    // Si onDelete déjà présent → no-op
    if (relObj.getProperty('onDelete'))
        return { ok: false, reason: 'onDelete déjà défini' };
    // Ajouter onDelete: 'cascade'
    relObj.addPropertyAssignment({ name: 'onDelete', initializer: `'cascade'` });
    return { ok: true };
}
// ─── R009 — add missing index ──────────────────────────────────
function fixR009_MissingIndex(sf, finding) {
    const schemaName = finding.location.schema;
    const fieldName = finding.location.field;
    if (!schemaName || !fieldName)
        return { ok: false, reason: 'schema/field manquant' };
    const schemaObj = findSchemaObjectLiteral(sf, schemaName);
    if (!schemaObj)
        return { ok: false, reason: `schema '${schemaName}' introuvable` };
    // Déterminer si on veut un index unique : on regarde si le field a unique:true
    const fieldsProp = schemaObj.getProperty('fields');
    if (!fieldsProp)
        return { ok: false, reason: 'pas de bloc `fields`' };
    const fieldsObj = fieldsProp.getInitializer();
    if (!fieldsObj || fieldsObj.getKindName() !== 'ObjectLiteralExpression') {
        return { ok: false, reason: 'fields pas un object literal' };
    }
    const fields = fieldsObj;
    const targetField = fields.getProperty(fieldName);
    if (!targetField)
        return { ok: false, reason: `champ '${fieldName}' introuvable` };
    const fieldDefInit = targetField.getInitializer();
    let isUnique = false;
    if (fieldDefInit && fieldDefInit.getKindName() === 'ObjectLiteralExpression') {
        const uniqueProp = fieldDefInit.getProperty('unique');
        if (uniqueProp && uniqueProp.getInitializer()?.getText() === 'true')
            isUnique = true;
    }
    // Trouver ou créer `indexes: [ … ]`
    let indexesProp = schemaObj.getProperty('indexes');
    if (!indexesProp) {
        schemaObj.addPropertyAssignment({ name: 'indexes', initializer: `[]` });
        indexesProp = schemaObj.getProperty('indexes');
    }
    const indexesArr = indexesProp.getInitializer();
    if (!indexesArr || indexesArr.getKindName() !== 'ArrayLiteralExpression') {
        return { ok: false, reason: 'indexes n\'est pas un array literal' };
    }
    // Vérifier qu'il n'y a pas déjà un index sur ce field (par texte simple — robuste)
    const existingText = indexesArr.getText();
    if (existingText.includes(`{ fields: { ${fieldName}: `)) {
        return { ok: false, reason: 'index déjà présent pour ce field' };
    }
    // Ajouter l'index
    const newIndexLiteral = isUnique
        ? `{ fields: { ${fieldName}: 'asc' }, unique: true }`
        : `{ fields: { ${fieldName}: 'asc' } }`;
    indexesArr.addElement(newIndexLiteral);
    return { ok: true };
}
/**
 * Trouve tous les `<file>.bak` dans sourceRoot et les restaure vers `<file>`,
 * puis supprime le `.bak`. Idempotent : si pas de .bak, no-op.
 */
export function rollbackFixes(sourceRoot) {
    const results = [];
    const baks = [];
    walkBak(resolve(sourceRoot));
    return apply();
    function walkBak(d) {
        let entries;
        try {
            entries = readdirSync(d);
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (e === 'node_modules' || e === 'dist' || e === '.next' || e === '.git')
                continue;
            const full = join(d, e);
            let st;
            try {
                st = statSync(full);
            }
            catch {
                continue;
            }
            if (st.isDirectory())
                walkBak(full);
            else if (full.endsWith('.bak'))
                baks.push(full);
        }
    }
    function apply() {
        for (const bak of baks) {
            const original = bak.slice(0, -4); // strip .bak
            try {
                if (!existsSync(bak)) {
                    results.push({ file: original, restored: false, reason: 'bak missing' });
                    continue;
                }
                renameSync(bak, original);
                results.push({ file: original, restored: true });
            }
            catch (e) {
                results.push({ file: original, restored: false, reason: e.message });
            }
        }
        return results;
    }
}
// ─── Helpers ──────────────────────────────────────────────────
function findSchemaFiles(root) {
    const out = [];
    walk(resolve(root));
    return out;
    function walk(d) {
        let entries;
        try {
            entries = readdirSync(d);
        }
        catch {
            return;
        }
        for (const e of entries) {
            if (e === 'node_modules' || e === 'dist' || e === '.next' || e === '.git')
                continue;
            const full = join(d, e);
            let st;
            try {
                st = statSync(full);
            }
            catch {
                continue;
            }
            if (st.isDirectory())
                walk(full);
            else if ((full.endsWith('.ts') || full.endsWith('.tsx')) && !full.endsWith('.d.ts')) {
                out.push(full);
            }
        }
    }
}
function locateSchemaFile(schemaFiles, schemaName) {
    // Cherche `export const <SchemaName>Schema = ` dans chaque fichier
    const re = new RegExp(`export\\s+const\\s+${escapeRegex(schemaName)}Schema\\s*[:=]`);
    for (const f of schemaFiles) {
        try {
            if (re.test(readFileSync(f, 'utf-8')))
                return f;
        }
        catch { /* skip */ }
    }
    return null;
}
function findSchemaObjectLiteral(sf, schemaName) {
    const varDecl = sf.getVariableDeclaration(`${schemaName}Schema`);
    if (!varDecl)
        return null;
    const init = varDecl.getInitializer();
    if (!init)
        return null;
    // Cas direct : `export const FooSchema: EntitySchema = { … }`
    if (init.getKindName() === 'ObjectLiteralExpression') {
        return init;
    }
    // Cas avec cast : `{ … } as EntitySchema`
    if (init.getKindName() === 'AsExpression') {
        const inner = init.getExpression();
        if (inner?.getKindName() === 'ObjectLiteralExpression')
            return inner;
    }
    return null;
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// ─── Diff unifié (simple, pour preview) ──────────────────────
function unifiedDiff(filename, before, after) {
    const a = before.split('\n');
    const b = after.split('\n');
    // Diff simple ligne-à-ligne (pas le vrai algo de Myers, mais suffit pour preview)
    // V2 : utiliser une lib `diff` standard.
    let out = `--- a/${filename}\n+++ b/${filename}\n`;
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            i++;
            j++;
            continue;
        }
        if (j < b.length) {
            out += `+${b[j]}\n`;
            j++;
            continue;
        }
        if (i < a.length) {
            out += `-${a[i]}\n`;
            i++;
            continue;
        }
    }
    return out;
}

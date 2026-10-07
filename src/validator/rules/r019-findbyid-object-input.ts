// R019-FINDBYID-OBJECT-INPUT — détecte les appels findById(x.rel) où x.rel est
// une relation déclarée dans un schema ORM. Sous fetch:'eager' (ou avec
// findByIdWithRelations), x.rel est un objet, pas une string id — le PK
// lookup direct est alors faux/incorrect en pre-2.0 et inutilement coûteux
// en 2.0+ (l'introspection résout déjà, mais l'intention reste ambiguë).
//
// Détection AST via ts-morph — robuste face aux strings/commentaires et aux
// appels imbriqués. Field-name matching contre la table des relations de
// l'ensemble des schémas (pas d'analyse de type cross-module, à l'instar
// de R001/R002).
//
// Sévérité : warning. Auto-fixable (insertion d'import extractRelId si absent
// + wrap de l'expression). L'auto-fix est cross-file (modifie du code
// consumer) — backup .bak + dry-run par défaut. Idempotent.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import { Project, SyntaxKind } from 'ts-morph'
import type { Finding, Rule, RuleContext } from '../types.js'

export const R019_FINDBYID_OBJECT_INPUT: Rule = {
  id: 'R019-FINDBYID-OBJECT-INPUT',
  description:
    "Détecte les `findById(entity.relationField)` où relationField est une relation ORM — passe un objet sous fetch:'eager', source d'ambiguïté.",
  defaultSeverity: 'warning',
  needsSource: true,

  apply(ctx: RuleContext): Finding[] {
    const findings: Finding[] = []
    if (!ctx.sourceFiles || ctx.sourceFiles.length === 0) return findings

    // Table des relations : set de noms de relations à travers tous les schémas.
    // On accepte un faux positif marginal (deux schémas avec relation
    // homonyme de sémantique différente) — cohérent avec R001/R002.
    const relationNames = new Set<string>()
    for (const schema of ctx.schemas) {
      for (const relName of Object.keys(schema.relations ?? {})) {
        relationNames.add(relName)
      }
    }
    if (relationNames.size === 0) return findings

    const project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      skipLoadingLibFiles: true,
    })

    for (const sf of ctx.sourceFiles) {
      if (sf.relPath.includes('node_modules/') || sf.relPath.startsWith('dist/')) continue
      if (!sf.path.endsWith('.ts') && !sf.path.endsWith('.tsx')) continue

      let source
      try {
        source = project.createSourceFile(sf.path, sf.content, { overwrite: true })
      } catch {
        continue
      }

      const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression)
      for (const call of calls) {
        const expr = call.getExpression()
        if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue
        const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression)!
        if (propAccess.getName() !== 'findById') continue

        const args = call.getArguments()
        if (args.length === 0) continue
        const firstArg = args[0]!

        // Cas 1 : findById(reg.project) — PropertyAccessExpression directe
        // Cas 2 : findById(reg.project.id) — on ignore, c'est déjà un id explicite
        // Cas 3 : findById(extractRelId(reg.project)) — on ignore, déjà sûr
        // Cas 4 : findById({ id: ... }) — non pertinent ici, géré par introspection
        if (firstArg.getKind() !== SyntaxKind.PropertyAccessExpression) continue
        const argAccess = firstArg.asKind(SyntaxKind.PropertyAccessExpression)!

        // Filtrer `.id`, `.name`, etc. — on ne flag QUE si la propriété
        // accessed matche un nom de relation.
        const accessedField = argAccess.getName()
        if (!relationNames.has(accessedField)) continue

        // Skip si l'argument est déjà wrappé par extractRelId(...)
        // (le check est implicite : on a déjà filtré sur PropertyAccessExpression,
        //  donc extractRelId(...) est une CallExpression, jamais matchée ici).

        const sourceObject = argAccess.getExpression().getText()
        const fullCallText = call.getText()
        const replacement = fullCallText.replace(
          argAccess.getText(),
          `extractRelId(${argAccess.getText()})`,
        )

        const start = call.getStart()
        const { line, column } = source.getLineAndColumnAtPos(start)

        findings.push({
          ruleId: R019_FINDBYID_OBJECT_INPUT.id,
          severity: R019_FINDBYID_OBJECT_INPUT.defaultSeverity,
          message:
            `findById(\`${argAccess.getText()}\`) — \`${accessedField}\` est une relation ORM, ` +
            `l'argument peut être un objet ou une string id selon le fetch mode.`,
          location: {
            file: sf.relPath,
            line,
          },
          suggestion: [
            `Sécuriser l'appel pour lazy ET eager :`,
            ``,
            `  // Option A — depuis @mostajs/orm 2.0, findById accepte {id} :`,
            `  await repo.findById(${sourceObject}.${accessedField})   // OK en 2.0+ via introspection`,
            ``,
            `  // Option B — explicite, fonctionne aussi en 1.x :`,
            `  import { extractRelId } from '@mostajs/orm'`,
            `  await repo.findById(extractRelId(${sourceObject}.${accessedField}))`,
            ``,
            `Diff de l'option B sur cette ligne :`,
            `  - ${fullCallText}`,
            `  + ${replacement}`,
          ].join('\n'),
          fixable: true,
          contextDataJson: JSON.stringify({
            sourceObject,
            relationName: accessedField,
            originalCall: fullCallText,
            suggestedReplacement: replacement,
            line,
            column,
          }),
        })
      }
    }

    return findings
  },
}

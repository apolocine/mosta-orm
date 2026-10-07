// R020-NATURAL-KEY-LOOKUP-OPPORTUNITY — détecte les `findOne({ field: x })`
// (ou composite) où l'ensemble des fields match un unique index du schema.
// Suggère que `findById({ field: x })` est équivalent et reste un lookup
// polymorphique réutilisable.
//
// Sévérité : info. Non auto-fixable PAR DESIGN — `findOne` reste valable et
// lisible ; R020 signale juste qu'un findById polymorphique est disponible
// pour du code générique. C'est une opportunité, pas une dette.
//
// Détection AST via ts-morph : repère les CallExpression de la forme
// `xxx.findOne(<ObjectLiteralExpression>)` et compare les noms de propriétés
// à la table des unique indexes des schémas.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import { Project, SyntaxKind } from 'ts-morph'
import type { Finding, Rule, RuleContext } from '../types.js'

interface UniqueIndexShape {
  schemaName: string
  fieldNames: string[]      // ordre déterministe (ordre de déclaration)
  fieldSet: Set<string>     // membership rapide
}

export const R020_NATURAL_KEY_LOOKUP_OPPORTUNITY: Rule = {
  id: 'R020-NATURAL-KEY-LOOKUP-OPPORTUNITY',
  description:
    'Repère les `findOne({ uniqueField: x })` qui pourraient aussi s\'écrire `findById({ uniqueField: x })` — opportunité, pas obligation.',
  defaultSeverity: 'info',
  needsSource: true,

  apply(ctx: RuleContext): Finding[] {
    const findings: Finding[] = []
    if (!ctx.sourceFiles || ctx.sourceFiles.length === 0) return findings

    // Collecter tous les unique indexes (single et composite). On garde le
    // schema d'origine uniquement pour le message — la détection reste
    // tolérante (si plusieurs schémas ont un index unique compatible, on
    // mentionne le premier match).
    const uniqueShapes: UniqueIndexShape[] = []
    for (const schema of ctx.schemas) {
      for (const idx of schema.indexes ?? []) {
        if (!idx.unique) continue
        const fieldNames = Object.keys(idx.fields ?? {})
        if (fieldNames.length === 0) continue
        uniqueShapes.push({
          schemaName: schema.name,
          fieldNames,
          fieldSet: new Set(fieldNames),
        })
      }
    }
    if (uniqueShapes.length === 0) return findings

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
        if (propAccess.getName() !== 'findOne') continue

        const args = call.getArguments()
        if (args.length === 0) continue
        const firstArg = args[0]!

        if (firstArg.getKind() !== SyntaxKind.ObjectLiteralExpression) continue
        const obj = firstArg.asKind(SyntaxKind.ObjectLiteralExpression)!

        // Récupérer les noms de propriétés simples (PropertyAssignment avec
        // un identifier ou string literal — pas les spreads/computed).
        const propNames: string[] = []
        let hasOperatorKey = false  // détection $or, $and, $regex, etc.
        for (const p of obj.getProperties()) {
          if (p.getKind() !== SyntaxKind.PropertyAssignment) continue
          const pa = p.asKind(SyntaxKind.PropertyAssignment)!
          const nameNode = pa.getNameNode()
          let name: string
          if (nameNode.getKind() === SyntaxKind.Identifier) {
            name = nameNode.getText()
          } else if (nameNode.getKind() === SyntaxKind.StringLiteral) {
            // strip quotes
            name = nameNode.getText().slice(1, -1)
          } else {
            continue
          }
          if (name.startsWith('$')) {
            hasOperatorKey = true
            break
          }
          propNames.push(name)
        }
        if (hasOperatorKey) continue
        if (propNames.length === 0) continue

        // Chercher un unique index dont l'ensemble des fields = exactement
        // l'ensemble des keys du filtre (pas strict subset — on ne flag PAS
        // si le caller met des conditions supplémentaires).
        const propSet = new Set(propNames)
        const match = uniqueShapes.find(shape => {
          if (shape.fieldSet.size !== propSet.size) return false
          for (const f of shape.fieldSet) {
            if (!propSet.has(f)) return false
          }
          return true
        })
        if (!match) continue

        const { line } = source.getLineAndColumnAtPos(call.getStart())
        const receiver = propAccess.getExpression().getText()
        const filterText = obj.getText()
        const originalCall = call.getText()

        findings.push({
          ruleId: R020_NATURAL_KEY_LOOKUP_OPPORTUNITY.id,
          severity: R020_NATURAL_KEY_LOOKUP_OPPORTUNITY.defaultSeverity,
          message:
            `findOne(${filterText}) correspond à l'index unique \`${match.fieldNames.join('+')}\` ` +
            `du schema \`${match.schemaName}\` — `
            + `findById polymorphique disponible si le code doit être générique.`,
          location: {
            file: sf.relPath,
            line,
            schema: match.schemaName,
          },
          suggestion: [
            `Les deux écritures sont valides et complémentaires :`,
            ``,
            `  // ✓ findOne — lookup explicite par field, lisibilité claire :`,
            `  await ${receiver}.findOne(${filterText})`,
            ``,
            `  // ✓ findById — lookup polymorphique, réutilisable en code générique :`,
            `  await ${receiver}.findById(${filterText})`,
            ``,
            `R020 est info-only : utiliser findById si la fonction reçoit un identifiant`,
            `dont la nature (PK vs natural key) est variable ; garder findOne sinon.`,
          ].join('\n'),
          fixable: false,
          contextDataJson: JSON.stringify({
            receiver,
            indexFields: match.fieldNames,
            schemaName: match.schemaName,
            originalCall,
            line,
          }),
        })
      }
    }

    return findings
  },
}

// R021-DIRECT-RELATION-COMPARISON — détecte les comparaisons `===` / `!==`
// dont un des opérandes est `entity.relationField`. Sous `fetch:'eager'`,
// `entity.relationField` est un objet ; la comparaison à une string id est
// alors TOUJOURS fausse. JS n'a pas d'operator overloading — bug silencieux.
//
// Sévérité : warning. Auto-fixable cross-file : insertion d'import
// extractRelId si absent + wrap de l'opérande relation. Idempotent.
//
// Détection AST via ts-morph : BinaryExpression dont operator est === / !==
// et au moins un côté est une PropertyAccessExpression `xxx.fieldName` où
// fieldName est déclaré comme relation dans un des schémas.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import { Project, SyntaxKind, Node } from 'ts-morph'
import type { Finding, Rule, RuleContext } from '../types.js'

export const R021_DIRECT_RELATION_COMPARISON: Rule = {
  id: 'R021-DIRECT-RELATION-COMPARISON',
  description:
    "Détecte les comparaisons `entity.relation === value` — toujours fausses sous fetch:'eager'.",
  defaultSeverity: 'warning',
  needsSource: true,

  apply(ctx: RuleContext): Finding[] {
    const findings: Finding[] = []
    if (!ctx.sourceFiles || ctx.sourceFiles.length === 0) return findings

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

      const binaries = source.getDescendantsOfKind(SyntaxKind.BinaryExpression)
      for (const bin of binaries) {
        const op = bin.getOperatorToken().getKind()
        if (op !== SyntaxKind.EqualsEqualsEqualsToken && op !== SyntaxKind.ExclamationEqualsEqualsToken) {
          continue
        }
        const opText = op === SyntaxKind.EqualsEqualsEqualsToken ? '===' : '!=='
        const left = bin.getLeft()
        const right = bin.getRight()

        const leftRel = relationAccess(left, relationNames)
        const rightRel = relationAccess(right, relationNames)

        // Si les DEUX côtés sont des relations, on flag quand même (on
        // privilégie le gauche pour le message). C'est une comparaison
        // double-relation : encore plus suspecte.
        const target = leftRel ?? rightRel
        if (!target) continue

        const { sourceObject, relationName, fullText } = target
        const otherSide = leftRel ? right.getText() : left.getText()
        const relSide = `${sourceObject}.${relationName}`
        // Skip si l'autre côté est déjà extractRelId(...) — le caller a fait
        // le boulot dans un sens, mais on flag tout de même si CE côté n'est
        // pas wrappé (asymétrique). Plus simple : ne pas skipper, c'est rare.

        // Construction du diff suggéré : préfixe le côté relation par extractRelId.
        const originalText = bin.getText()
        const replacedSide = `extractRelId(${relSide})`
        const newText = leftRel
          ? `${replacedSide} ${opText} ${otherSide}`
          : `${otherSide} ${opText} ${replacedSide}`

        const { line } = source.getLineAndColumnAtPos(bin.getStart())

        findings.push({
          ruleId: R021_DIRECT_RELATION_COMPARISON.id,
          severity: R021_DIRECT_RELATION_COMPARISON.defaultSeverity,
          message:
            `Comparaison \`${fullText}\` — \`${relationName}\` est une relation ORM ; ` +
            `sous fetch:'eager' c'est un objet, donc l'expression est TOUJOURS ${opText === '===' ? 'false' : 'true'}.`,
          location: {
            file: sf.relPath,
            line,
          },
          suggestion: [
            `Normaliser explicitement avec extractRelId — sûr en lazy ET eager :`,
            ``,
            `  import { extractRelId } from '@mostajs/orm'`,
            ``,
            `Diff sur cette ligne :`,
            `  - ${originalText}`,
            `  + ${newText}`,
            ``,
            `Alternative (uniquement si vous gardez fetch:'eager') : ${relSide}.id ${opText} ${otherSide}`,
            `— mais cette forme casse en lazy. extractRelId est portable.`,
          ].join('\n'),
          fixable: true,
          contextDataJson: JSON.stringify({
            sourceObject,
            relationName,
            operator: opText,
            otherSide,
            originalExpression: originalText,
            suggestedExpression: newText,
            line,
          }),
        })
      }
    }

    return findings
  },
}

interface RelationAccessMatch {
  sourceObject: string     // texte avant le .field, ex: 'reg' ou 'await regRepo.findById(id)'
  relationName: string     // 'project'
  fullText: string         // 'reg.project'
}

/**
 * Retourne l'access relation si `node` est une PropertyAccessExpression
 * `xxx.relationName` ET `relationName` est dans `relationNames`. Sinon
 * `undefined`.
 *
 * On ignore les `.relationName.id` (déjà extrait explicitement par le caller)
 * et les `extractRelId(xxx.relationName)` (déjà wrappé).
 */
function relationAccess(node: Node, relationNames: Set<string>): RelationAccessMatch | undefined {
  if (node.getKind() !== SyntaxKind.PropertyAccessExpression) return undefined
  const pa = node.asKind(SyntaxKind.PropertyAccessExpression)!
  const fieldName = pa.getName()

  // Si le caller fait déjà `.id` final, on regarde le parent pour décider :
  // `reg.project.id` → ici on est sur `.id`, pas sur `.project`. Le walk
  // visite les deux niveaux ; on ne flag que la PropertyAccessExpression
  // dont le nom matche une relation. Donc `reg.project.id` n'est pas flagué :
  // pa.getName() = 'id', qui n'est pas une relation.
  if (!relationNames.has(fieldName)) return undefined

  // Cas particulier : le parent immédiat est `.id` → le caller fait déjà
  // `reg.project.id === x`, c'est l'extraction explicite, pas de R021.
  const parent = node.getParent()
  if (parent && parent.getKind() === SyntaxKind.PropertyAccessExpression) {
    const parentAccess = parent.asKind(SyntaxKind.PropertyAccessExpression)!
    if (parentAccess.getExpression() === node) {
      // node est le RECEIVER d'un autre access — donc pattern `node.X`. Skip.
      return undefined
    }
  }

  return {
    sourceObject: pa.getExpression().getText(),
    relationName: fieldName,
    fullText: pa.getText(),
  }
}

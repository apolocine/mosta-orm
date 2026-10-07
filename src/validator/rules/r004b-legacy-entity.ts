// R004b-LEGACY-ENTITY — détecte un schéma qui semble être une version legacy
// d'un autre schéma canonique. Heuristique complémentaire à R004 (qui se base
// sur Jaccard des champs) pour les cas où les schémas ont peu de champs en
// commun mais où les noms se chevauchent fortement.
//
// Algorithme :
//   1. Pour chaque paire (A, B) de schémas :
//      a. Si B.name contient A.name comme substring de longueur ≥ minSubstring
//         (ou inversement), c'est un signal de duplicate (ex: 'User' vs 'AuthUser')
//      b. OU si jaroWinkler(A.name, B.name) >= threshold
//   2. Si le pattern matche, flagger le plus court / plus simple comme
//      potentiellement legacy.
//
// Si sourceFiles dispo : booster la confiance avec détection de commentaire
// 'legacy', 'deprecated', '@deprecated' près de la déclaration du schéma.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type { Finding, Rule, RuleContext } from '../types.js'

const MIN_SUBSTRING = 4   // ex: 'User' (4 chars) trouvé dans 'AuthUser'
const JARO_WINKLER_THRESHOLD = 0.75

export const R004B_LEGACY_ENTITY: Rule = {
  id: 'R004B-LEGACY-ENTITY',
  description: 'Détecte des schémas dont les noms se chevauchent (substring ou Jaro-Winkler élevé) — potentiel legacy/duplication.',
  defaultSeverity: 'info',

  apply(ctx: RuleContext): Finding[] {
    const findings: Finding[] = []
    const schemas = ctx.schemas

    for (let i = 0; i < schemas.length; i++) {
      for (let j = i + 1; j < schemas.length; j++) {
        const a = schemas[i]!
        const b = schemas[j]!
        if (a.name === b.name) continue

        // Heuristique 1 : containment (l'un est substring de l'autre, ≥ MIN_SUBSTRING chars)
        const aLower = a.name.toLowerCase()
        const bLower = b.name.toLowerCase()
        const minLen = Math.min(aLower.length, bLower.length)
        let isContainment = false
        if (minLen >= MIN_SUBSTRING) {
          if (aLower.includes(bLower) || bLower.includes(aLower)) {
            isContainment = true
          }
        }

        // Heuristique 2 : Jaro-Winkler similarity
        const jw = jaroWinkler(aLower, bLower)
        const isHighSim = jw >= JARO_WINKLER_THRESHOLD

        if (!isContainment && !isHighSim) continue

        // Pour départager : le plus court ou le moins riche en champs est suspect "legacy"
        const aFields = Object.keys(a.fields ?? {}).length
        const bFields = Object.keys(b.fields ?? {}).length
        const [legacy, canonical] = aFields <= bFields ? [a, b] : [b, a]

        // Booster confiance via sourceFiles si dispo : commentaire 'legacy'/'deprecated'
        let hasLegacyHint = false
        if (ctx.sourceFiles) {
          const pattern = new RegExp(`(legacy|deprecated|@deprecated).*${legacy.name}`, 'i')
          for (const sf of ctx.sourceFiles) {
            if (pattern.test(sf.content)) { hasLegacyHint = true; break }
            // Inversé : commentaire avant la déclaration
            const declIdx = sf.content.indexOf(`export const ${legacy.name}Schema`)
            if (declIdx > 0) {
              const before = sf.content.slice(Math.max(0, declIdx - 300), declIdx)
              if (/(legacy|deprecated|@deprecated)/i.test(before)) { hasLegacyHint = true; break }
            }
          }
        }

        findings.push({
          ruleId: R004B_LEGACY_ENTITY.id,
          severity: hasLegacyHint ? 'warning' : R004B_LEGACY_ENTITY.defaultSeverity,
          message: `Schémas '${legacy.name}' et '${canonical.name}' ont des noms qui se chevauchent (${isContainment ? 'substring' : `jaro-winkler=${jw.toFixed(2)}`}) — '${legacy.name}' (${aFields <= bFields ? aFields : bFields} champs) est peut-être legacy.${hasLegacyHint ? ' Commentaire "legacy/deprecated" détecté dans les sources.' : ''}`,
          location: { schema: legacy.name },
          suggestion: [
            `Vérifier si '${legacy.name}' est encore utilisé :`,
            `  grep -rn '${legacy.name}Schema\\|${legacy.collection ?? legacy.name.toLowerCase() + 's'}' lib/ app/`,
            ``,
            `Si zéro consumer non-legacy :`,
            `  - supprimer schemas/${legacy.name.toLowerCase()}.schema.ts`,
            `  - retirer du registerSchemas()`,
            `  - DROP TABLE ${legacy.collection ?? legacy.name.toLowerCase() + 's'} (après backup)`,
            ``,
            `Si encore utilisé, migrer vers '${canonical.name}' canonique.`,
          ].join('\n'),
          fixable: false,
          contextDataJson: JSON.stringify({ legacy: legacy.name, canonical: canonical.name, jaroWinkler: jw, isContainment, hasLegacyHint }),
        })
      }
    }

    return findings
  },
}

// ─── Jaro-Winkler implementation (pas de dep externe) ──────────────

function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b)
  if (j < 0.7) return j   // pas de bonus si trop faible
  // Bonus pour préfixe commun, max 4 chars
  let prefix = 0
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++
    else break
  }
  const SCALING = 0.1
  return j + prefix * SCALING * (1 - j)
}

function jaro(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0
  const matchDist = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatches = new Array(a.length).fill(false)
  const bMatches = new Array(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDist)
    const end = Math.min(i + matchDist + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue
      if (a[i] !== b[j]) continue
      aMatches[i] = bMatches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  // Compter les transpositions
  let k = 0, transpositions = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  transpositions /= 2
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3
}

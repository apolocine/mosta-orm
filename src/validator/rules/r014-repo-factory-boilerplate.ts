// R014-REPO-FACTORY-BOILERPLATE — détecte des helpers `getXxxRepo()` répétitifs
// dans les sources qui pourraient être factorisés via une factory générique.
//
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type { Finding, Rule, RuleContext } from '../types.js'

const RE_REPO_FACTORY = /export\s+(?:async\s+)?function\s+get(\w+)Repo\s*\(/g

export const R014_REPO_FACTORY_BOILERPLATE: Rule = {
  id: 'R014-REPO-FACTORY-BOILERPLATE',
  description: 'Détecte les helpers getXxxRepo() répétitifs (> threshold) susceptibles d\'être factorisés.',
  defaultSeverity: 'info',
  needsSource: true,

  apply(ctx: RuleContext): Finding[] {
    const findings: Finding[] = []
    if (!ctx.sourceFiles) return findings

    // Compte les helpers par fichier
    for (const sf of ctx.sourceFiles) {
      if (!sf.path.endsWith('.ts') && !sf.path.endsWith('.tsx')) continue
      RE_REPO_FACTORY.lastIndex = 0
      const matches: string[] = []
      let m
      while ((m = RE_REPO_FACTORY.exec(sf.content)) !== null) {
        matches.push(m[1]!)
      }
      if (matches.length < 5) continue   // seuil arbitraire mais raisonnable

      findings.push({
        ruleId: R014_REPO_FACTORY_BOILERPLATE.id,
        severity: R014_REPO_FACTORY_BOILERPLATE.defaultSeverity,
        message: `${matches.length} helpers \`get*Repo()\` détectés dans ${sf.relPath} — potentiel boilerplate.`,
        location: { file: sf.relPath },
        suggestion: [
          `Factoriser via une factory générique :`,
          ``,
          `  const _repoCache = new Map<EntitySchema, BaseRepository<any>>()`,
          `  export async function makeRepo<T>(schema: EntitySchema): Promise<BaseRepository<T>> {`,
          `    if (!_repoCache.has(schema)) {`,
          `      _repoCache.set(schema, new BaseRepository(schema, await getDialect()))`,
          `    }`,
          `    return _repoCache.get(schema) as BaseRepository<T>`,
          `  }`,
          ``,
          `Et appeler \`makeRepo<ProjectRow>(ProjectSchema)\` au lieu de \`getProjectRepo()\`.`,
        ].join('\n'),
        fixable: false,
        contextDataJson: JSON.stringify({ helpersCount: matches.length, helpers: matches.slice(0, 10) }),
      })
    }

    return findings
  },
}

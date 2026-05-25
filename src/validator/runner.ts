// @mostajs/orm/validator — runner
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Exécute toutes les règles enregistrées sur le set de schémas + options.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { EntitySchema } from '../core/types.js'
import {
  type Finding, type Report, type Rule, type RuleContext, type SourceFile,
  type ValidateOptions, type Severity,
  DEFAULT_SOFT_DELETE_PATTERNS, DEFAULT_AUDIT_BY_FIELDS, DEFAULT_THRESHOLDS,
} from './types.js'
import { R001_EMPTY_RELATIONS } from './rules/r001-empty-relations.js'
import { R002_FK_NAMING } from './rules/r002-fk-naming.js'
import { R003_SOFT_DELETE } from './rules/r003-soft-delete.js'
import { R004_DUPLICATE_ENTITY } from './rules/r004-duplicate-entity.js'
import { R004B_LEGACY_ENTITY } from './rules/r004b-legacy-entity.js'
import { R005_ANY_TYPED_REPO } from './rules/r005-any-typed-repo.js'
import { R006_JSON_AS_RELATION } from './rules/r006-json-as-relation.js'
import { R009_MISSING_LOOKUP_INDEX } from './rules/r009-missing-lookup-index.js'
import { R010_MISSING_AUDIT_TABLE } from './rules/r010-missing-audit-table.js'
import { R013_MISSING_CASCADE } from './rules/r013-missing-cascade.js'
import { R014_REPO_FACTORY_BOILERPLATE } from './rules/r014-repo-factory-boilerplate.js'
import { R015_FLAT_LIB_STRUCTURE } from './rules/r015-flat-lib-structure.js'
import { R016_AUDIT_EMAIL_AS_STRING } from './rules/r016-audit-email-as-string.js'
import { R017_UNBOUNDED_BLOB } from './rules/r017-unbounded-blob.js'
import {
  R007_REDUNDANT_DERIVED_FIELD,
  R008_BEST_EFFORT_RESOLVER,
  R011_LEGACY_DEAD_CODE,
  R012_DUPLICATE_IMPLEMENTATION,
  R018_EXTERNAL_SCHEMA_OVERSCOPED,
} from './rules/r007-r008-r011-r012-r018-stubs.js'
import { R019_FINDBYID_OBJECT_INPUT } from './rules/r019-findbyid-object-input.js'
import { R020_NATURAL_KEY_LOOKUP_OPPORTUNITY } from './rules/r020-natural-key-lookup-opportunity.js'
import { R021_DIRECT_RELATION_COMPARISON } from './rules/r021-direct-relation-comparison.js'
import { R003B_UNIQUE_WITH_SOFTDELETE_CONFLICT } from './rules/r003b-unique-with-softdelete-conflict.js'
import { R013B_EAGER_WITHOUT_CASCADE } from './rules/r013b-eager-without-cascade.js'

const DEFAULT_RULES: Rule[] = [
  R001_EMPTY_RELATIONS,
  R002_FK_NAMING,
  R003_SOFT_DELETE,
  R004_DUPLICATE_ENTITY,
  R004B_LEGACY_ENTITY,
  R005_ANY_TYPED_REPO,
  R006_JSON_AS_RELATION,
  R007_REDUNDANT_DERIVED_FIELD,
  R008_BEST_EFFORT_RESOLVER,
  R009_MISSING_LOOKUP_INDEX,
  R010_MISSING_AUDIT_TABLE,
  R011_LEGACY_DEAD_CODE,
  R012_DUPLICATE_IMPLEMENTATION,
  R013_MISSING_CASCADE,
  R014_REPO_FACTORY_BOILERPLATE,
  R015_FLAT_LIB_STRUCTURE,
  R016_AUDIT_EMAIL_AS_STRING,
  R017_UNBOUNDED_BLOB,
  R018_EXTERNAL_SCHEMA_OVERSCOPED,
  R019_FINDBYID_OBJECT_INPUT,
  R020_NATURAL_KEY_LOOKUP_OPPORTUNITY,
  R021_DIRECT_RELATION_COMPARISON,
  R003B_UNIQUE_WITH_SOFTDELETE_CONFLICT,
  R013B_EAGER_WITHOUT_CASCADE,
]

/** Point d'entrée principal. */
export async function validateSchemas(
  schemas: EntitySchema[],
  options: ValidateOptions = {},
): Promise<Report> {
  const t0 = Date.now()
  const opts = {
    softDeletePatterns: options.softDeletePatterns ?? DEFAULT_SOFT_DELETE_PATTERNS,
    auditByFields: options.auditByFields ?? DEFAULT_AUDIT_BY_FIELDS,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(options.thresholds ?? {}) },
    ...options,
  }

  let sourceFiles: SourceFile[] | undefined
  if (options.sourceRoot) {
    sourceFiles = readSourceTree(options.sourceRoot)
  }

  const ctx: RuleContext = { schemas, options: opts as any, sourceFiles }

  const findings: Finding[] = []
  for (const rule of DEFAULT_RULES) {
    if (options.ignore?.includes(rule.id)) continue
    if (rule.needsSource && !sourceFiles) continue
    try {
      const ruleFindings = rule.apply(ctx)
      // Appliquer override sévérité si présent dans options.rules
      for (const f of ruleFindings) {
        const overrideKey = Object.keys(options.rules ?? {}).find(k => f.ruleId.startsWith(k))
        if (overrideKey && options.rules![overrideKey]) {
          f.severity = options.rules![overrideKey]!
        }
      }
      findings.push(...ruleFindings)
    } catch (e) {
      // Une règle qui crash ne doit pas casser le validator entier.
      findings.push({
        ruleId: rule.id,
        severity: 'error' as Severity,
        message: `Rule '${rule.id}' a lancé une exception : ${(e as Error).message}`,
        location: {},
        suggestion: 'Ouvrir un bug sur @mostajs/orm.',
        fixable: false,
      })
    }
  }

  const countBySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0, hint: 0 }
  const countByRule: Record<string, number> = {}
  for (const f of findings) {
    countBySeverity[f.severity]++
    countByRule[f.ruleId] = (countByRule[f.ruleId] ?? 0) + 1
  }

  return {
    schemaCount: schemas.length,
    findings,
    countBySeverity,
    countByRule,
    durationMs: Date.now() - t0,
  }
}

/** Lit récursivement les fichiers .ts/.tsx d'un répertoire source. */
function readSourceTree(sourceRoot: string): SourceFile[] {
  const root = resolve(sourceRoot)
  const out: SourceFile[] = []
  walk(root, root)
  return out

  function walk(dir: string, base: string) {
    let entries: string[]
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.next' || entry === '.git') continue
      const full = join(dir, entry)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) {
        walk(full, base)
      } else if (st.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
        try {
          out.push({
            path: full,
            relPath: relative(base, full),
            content: readFileSync(full, 'utf-8'),
          })
        } catch { /* skip unreadable */ }
      }
    }
  }
}

/** Re-export pour permettre l'enregistrement de règles custom plus tard. */
export { DEFAULT_RULES }

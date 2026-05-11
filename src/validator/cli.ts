#!/usr/bin/env node
// @mostajs/orm/validator — CLI
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Usage :
//   npx mostajs-orm-validator <schemas-dir> [options]
//
// Le CLI charge dynamiquement tous les fichiers *.ts/*.js d'un répertoire et
// extrait toutes les `export const XxxSchema` qui matchent EntitySchema.
//
// Options :
//   --src <dir>          Active les règles cross-file (R005, R007, R008…)
//   --format <text|json|markdown>     Default text
//   --out <file>         Écrit le rapport dans <file> au lieu de stdout
//   --ignore <r1,r2>     Skip certaines règles
//   --ci                 Exit 1 si findings >= --max-warnings
//   --max-warnings <n>   Default 0
//   --verbose            Affiche les suggestions complètes
//   --fix                Applique les corrections automatiques (V3-A)
//   --fix-dry-run        Affiche les diffs sans modifier les fichiers
//   --fix-rules <r1,r2>  Filtre les règles à fixer (default toutes)
//   --no-backup          Pas de backup .bak en mode --fix
//   --rollback-fix       Restaure tous les <file>.bak du dernier --fix
//   -h, --help           Help

import { writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createJiti } from 'jiti'
import { validateSchemas } from './runner.js'
import { formatText, formatJson, formatMarkdown } from './reporters.js'
import { applyFixes, rollbackFixes } from './fixer.js'
import type { ValidateOptions } from './types.js'
import type { EntitySchema } from '../core/types.js'

const args = process.argv.slice(2)

function help(): never {
  console.log(`mostajs-orm-validator — ORMConceptValidator (@mostajs/orm)

Usage:
  mostajs-orm-validator <schemas-dir> [options]

Options:
  --src <dir>                Sources root pour règles cross-file (R005…)
  --format <text|json|md>    Format output (default text)
  --out <file>               Écrit dans un fichier au lieu de stdout
  --ignore <r1,r2>           Skip certaines règles (ex: --ignore R015,R017)
  --ci                       Exit 1 si findings ≥ max-warnings (severity ≥ warning)
  --max-warnings <n>         Seuil pour --ci (default 0)
  --verbose                  Affiche suggestions complètes
  --fix                      Applique les corrections auto (V3-A)
  --fix-dry-run              Affiche les diffs sans modifier les fichiers
  --fix-rules <r1,r2>        Filtre les règles à fixer (default toutes)
  --no-backup                Pas de backup .bak en mode --fix
  --rollback-fix             Restaure tous les <file>.bak du dernier --fix
  -h, --help                 Cette aide
`)
  process.exit(0)
}

if (args.length === 0 || args[0] === '-h' || args[0] === '--help') help()

const schemasDir = resolve(args[0]!)
let sourceRoot: string | undefined
let format: 'text' | 'json' | 'markdown' = 'text'
let outFile: string | undefined
const ignore: string[] = []
let ci = false
let maxWarnings = 0
let verbose = false
let fixMode: 'off' | 'apply' | 'dry-run' | 'rollback' = 'off'
let fixRules: string[] | undefined
let fixBackup = true

for (let i = 1; i < args.length; i++) {
  const a = args[i]!
  switch (a) {
    case '--src': sourceRoot = resolve(args[++i]!); break
    case '--format': {
      const v = args[++i]!
      if (v === 'text' || v === 'json' || v === 'markdown' || v === 'md') {
        format = v === 'md' ? 'markdown' : v
      } else {
        console.error(`Unknown format: ${v}`)
        process.exit(2)
      }
      break
    }
    case '--out': outFile = resolve(args[++i]!); break
    case '--ignore': ignore.push(...args[++i]!.split(',')); break
    case '--ci': ci = true; break
    case '--max-warnings': maxWarnings = Number(args[++i]); break
    case '--verbose': verbose = true; break
    case '--fix': fixMode = 'apply'; break
    case '--fix-dry-run': fixMode = 'dry-run'; break
    case '--rollback-fix': fixMode = 'rollback'; break
    case '--fix-rules': fixRules = args[++i]!.split(','); break
    case '--no-backup': fixBackup = false; break
    default:
      console.error(`Unknown option: ${a}`)
      process.exit(2)
  }
}

async function main() {
  const schemas = await loadSchemasFromDir(schemasDir)
  if (schemas.length === 0) {
    console.error(`No schemas found in ${schemasDir}`)
    process.exit(2)
  }

  const opts: ValidateOptions = { ignore }
  if (sourceRoot) opts.sourceRoot = sourceRoot

  const report = await validateSchemas(schemas, opts)

  let output: string
  switch (format) {
    case 'json': output = formatJson(report, true); break
    case 'markdown': output = formatMarkdown(report); break
    case 'text': output = formatText(report, { verbose }); break
  }

  if (outFile) {
    writeFileSync(outFile, output, 'utf-8')
    console.log(`Report written to ${outFile}`)
  } else {
    console.log(output)
  }

  // ─── Rollback mode (--rollback-fix) ────────────────────────────
  if (fixMode === 'rollback') {
    const root = sourceRoot ?? schemasDir
    console.log(`\n↶ Rollback : restauration des .bak dans ${root}…\n`)
    const restored = rollbackFixes(root)
    const ok = restored.filter(r => r.restored).length
    const fail = restored.filter(r => !r.restored).length
    for (const r of restored) {
      console.log(`  ${r.restored ? '✓' : '✗'} ${r.file}${r.reason ? ' — ' + r.reason : ''}`)
    }
    console.log(`\n  ${ok} restored, ${fail} failed.`)
    return
  }

  // ─── Auto-fix mode (V3-A) ───────────────────────────────────────
  if (fixMode !== 'off') {
    // Le fixer doit chercher les schemas dans schemasDir (1er arg CLI), pas
    // dans --src (qui est destiné aux règles cross-file R005/R007/R008…).
    const fixRoot = schemasDir
    const isDry = fixMode === 'dry-run'
    console.log(`\n${isDry ? '🔍 DRY-RUN' : '🔧 APPLY'} auto-fix on ${fixRoot}${fixRules ? ` (rules: ${fixRules.join(',')})` : ''}…\n`)
    const fixResults = await applyFixes(report, {
      sourceRoot: fixRoot,
      dryRun: isDry,
      rules: fixRules,
      backup: fixBackup,
    })

    const applied = fixResults.filter(r => r.applied)
    const skipped = fixResults.filter(r => !r.applied)
    console.log(`  ${applied.length} fix(es) ${isDry ? 'would be applied' : 'applied'}, ${skipped.length} skipped.\n`)

    for (const r of applied) {
      console.log(`  ✓ ${r.ruleId}  ${r.schema}${r.field ? '.' + r.field : ''}  (${r.file})`)
    }
    if (verbose) {
      for (const r of applied) {
        if (r.diff) console.log('\n' + r.diff)
      }
    }
    for (const r of skipped) {
      console.log(`  · skipped ${r.ruleId}  ${r.schema}${r.field ? '.' + r.field : ''}  — ${r.reason}`)
    }

    if (!isDry && applied.length > 0) {
      console.log(`\n${fixBackup ? 'Backups: <file>.bak ' : 'No backup. '}Run tests + git diff to review.`)
    }
  }

  if (ci) {
    const blocking = report.countBySeverity.error + report.countBySeverity.warning
    if (blocking > maxWarnings) {
      console.error(`\n✗ CI failure: ${blocking} blocking findings (max-warnings ${maxWarnings})`)
      process.exit(1)
    }
  }
}

async function loadSchemasFromDir(dir: string): Promise<EntitySchema[]> {
  // Dédup par name : un schema peut être exporté par plusieurs fichiers
  // (index.ts re-export + fichier source). On le compte une seule fois.
  const byName = new Map<string, EntitySchema>()
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
    fsCache: false,
    moduleCache: false,
  })
  await walk(dir)
  return [...byName.values()]

  async function walk(d: string) {
    let entries: string[]
    try { entries = readdirSync(d) } catch { return }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'dist' || e === '.next') continue
      const full = join(d, e)
      const st = statSync(full)
      if (st.isDirectory()) { await walk(full); continue }
      if (!/\.(ts|tsx|js|mjs)$/.test(full)) continue
      if (full.endsWith('.d.ts')) continue
      try {
        const mod: any = await jiti.import(full)
        for (const exp of Object.values(mod)) {
          if (!isEntitySchema(exp)) continue
          const s = exp as EntitySchema
          if (!byName.has(s.name)) byName.set(s.name, s)
        }
      } catch (e) {
        if (process.env.MOSTAJS_ORM_VALIDATOR_DEBUG) {
          console.error(`[debug] failed to load ${full}: ${(e as Error).message}`)
        }
      }
    }
  }
}

function isEntitySchema(x: any): boolean {
  return x && typeof x === 'object'
    && typeof x.name === 'string'
    && typeof x.collection === 'string'
    && x.fields && typeof x.fields === 'object'
}

main().catch(e => {
  console.error('Fatal:', (e as Error).message)
  process.exit(2)
})

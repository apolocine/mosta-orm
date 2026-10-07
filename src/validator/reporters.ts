// @mostajs/orm/validator — reporters (text + json + markdown)
// Author: Dr Hamid MADANI <drmdh@msn.com>

import type { Finding, Report, Severity } from './types.js'

// ─── Codes couleur ANSI (no-op si stdout n'est pas TTY) ────────────

const RESET = '\x1b[0m'
const COLORS: Record<Severity, string> = {
  error:   '\x1b[31m',  // red
  warning: '\x1b[33m',  // yellow
  info:    '\x1b[36m',  // cyan
  hint:    '\x1b[90m',  // gray
}
const ICONS: Record<Severity, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  hint: '·',
}

export interface FormatOptions {
  colors?: boolean
  verbose?: boolean   // affiche suggestion intégrale
}

// ─── Text (console) ─────────────────────────────────────────────────

export function formatText(report: Report, opts: FormatOptions = {}): string {
  const colors = opts.colors ?? process.stdout.isTTY
  const lines: string[] = []

  lines.push(banner('ORMConceptValidator — Report', colors))
  lines.push(`Schemas analyzed : ${report.schemaCount}`)
  lines.push(`Findings         : ${report.findings.length}`)
  lines.push(`  errors    : ${report.countBySeverity.error}`)
  lines.push(`  warnings  : ${report.countBySeverity.warning}`)
  lines.push(`  infos     : ${report.countBySeverity.info}`)
  lines.push(`  hints     : ${report.countBySeverity.hint}`)
  lines.push(`Duration         : ${report.durationMs}ms`)
  lines.push('')

  if (report.findings.length === 0) {
    lines.push(c('✓ No issues detected.', '\x1b[32m', colors))
    return lines.join('\n')
  }

  // Group by ruleId
  const byRule = new Map<string, Finding[]>()
  for (const f of report.findings) {
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, [])
    byRule.get(f.ruleId)!.push(f)
  }

  for (const [ruleId, group] of byRule) {
    lines.push(c(`▶ ${ruleId} — ${group.length} finding${group.length > 1 ? 's' : ''}`, '\x1b[1m', colors))
    for (const f of group) {
      const sevColor = colors ? COLORS[f.severity] : ''
      const reset = colors ? RESET : ''
      const loc = formatLocation(f)
      lines.push(`  ${sevColor}${ICONS[f.severity]}${reset} [${f.severity}] ${loc}`)
      lines.push(`    ${f.message}`)
      if (opts.verbose ?? true) {
        for (const sline of f.suggestion.split('\n')) {
          lines.push(`    ${c(sline, '\x1b[90m', colors)}`)
        }
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

function formatLocation(f: Finding): string {
  const parts: string[] = []
  if (f.location.schema) parts.push(f.location.schema)
  if (f.location.field) parts.push(`.${f.location.field}`)
  if (f.location.file) parts.push(`(${f.location.file}${f.location.line ? `:${f.location.line}` : ''})`)
  return parts.join('')
}

function c(s: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${s}${RESET}` : s
}

function banner(title: string, colors: boolean): string {
  const line = '─'.repeat(title.length)
  return [
    c(line, '\x1b[1m', colors),
    c(title, '\x1b[1m', colors),
    c(line, '\x1b[1m', colors),
  ].join('\n')
}

// ─── JSON (CI / diff) ────────────────────────────────────────────────

export function formatJson(report: Report, pretty = true): string {
  return pretty
    ? JSON.stringify(report, null, 2)
    : JSON.stringify(report)
}

// ─── Markdown (rapport humain lisible) ──────────────────────────────

export function formatMarkdown(report: Report): string {
  const lines: string[] = []
  lines.push('# ORMConceptValidator — Report')
  lines.push('')
  lines.push(`- **Schemas analyzed** : ${report.schemaCount}`)
  lines.push(`- **Findings** : ${report.findings.length} *(errors: ${report.countBySeverity.error}, warnings: ${report.countBySeverity.warning}, infos: ${report.countBySeverity.info}, hints: ${report.countBySeverity.hint})*`)
  lines.push(`- **Duration** : ${report.durationMs} ms`)
  lines.push('')

  if (report.findings.length === 0) {
    lines.push('✓ **No issues detected.**')
    return lines.join('\n')
  }

  const byRule = new Map<string, Finding[]>()
  for (const f of report.findings) {
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, [])
    byRule.get(f.ruleId)!.push(f)
  }

  for (const [ruleId, group] of byRule) {
    lines.push(`## ${ruleId} *(${group.length})*`)
    lines.push('')
    for (const f of group) {
      const sev = `${ICONS[f.severity]} ${f.severity}`
      lines.push(`### \`${formatLocation(f)}\` — ${sev}`)
      lines.push('')
      lines.push(f.message)
      lines.push('')
      if (f.suggestion) {
        lines.push('**Suggestion** :')
        lines.push('')
        lines.push('```')
        lines.push(f.suggestion)
        lines.push('```')
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

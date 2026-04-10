// Author: Dr Hamid MADANI drmdh@msn.com
// Helpers partagés pour les tests ORM + Setup

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

export function logHeader(label: string) {
  console.log(`\n${COLORS.bold}${COLORS.cyan}════════════════════════════════════════${COLORS.reset}`)
  console.log(`${COLORS.bold}${COLORS.cyan}  ${label}${COLORS.reset}`)
  console.log(`${COLORS.bold}${COLORS.cyan}════════════════════════════════════════${COLORS.reset}\n`)
}

export function logStep(step: string) {
  console.log(`${COLORS.yellow}▶ ${step}${COLORS.reset}`)
}

export function logOk(msg: string) {
  console.log(`  ${COLORS.green}✔ ${msg}${COLORS.reset}`)
}

export function logFail(msg: string) {
  console.log(`  ${COLORS.red}✘ ${msg}${COLORS.reset}`)
}

export function logInfo(msg: string) {
  console.log(`  ${COLORS.dim}${msg}${COLORS.reset}`)
}

export interface TestResult {
  phase: string
  test: string
  ok: boolean
  error?: string
  duration?: number
}

export class TestRunner {
  results: TestResult[] = []
  dialect: string

  constructor(dialect: string) {
    this.dialect = dialect
  }

  async run(phase: string, test: string, fn: () => Promise<void>): Promise<boolean> {
    const start = Date.now()
    try {
      await fn()
      const duration = Date.now() - start
      this.results.push({ phase, test, ok: true, duration })
      logOk(`${test} (${duration}ms)`)
      return true
    } catch (err: any) {
      const duration = Date.now() - start
      const error = err?.message || String(err)
      this.results.push({ phase, test, ok: false, error, duration })
      logFail(`${test}: ${error}`)
      return false
    }
  }

  printSummary() {
    const passed = this.results.filter(r => r.ok).length
    const failed = this.results.filter(r => !r.ok).length
    const total = this.results.length
    const totalTime = this.results.reduce((s, r) => s + (r.duration || 0), 0)

    console.log(`\n${COLORS.bold}── Résumé ${this.dialect} ──${COLORS.reset}`)
    console.log(`  Total: ${total}  |  ${COLORS.green}Passés: ${passed}${COLORS.reset}  |  ${failed > 0 ? COLORS.red : COLORS.green}Échoués: ${failed}${COLORS.reset}  |  Durée: ${totalTime}ms`)

    if (failed > 0) {
      console.log(`\n${COLORS.red}  Échecs:${COLORS.reset}`)
      for (const r of this.results.filter(r => !r.ok)) {
        console.log(`    ${COLORS.red}✘ [${r.phase}] ${r.test}: ${r.error}${COLORS.reset}`)
      }
    }

    return failed === 0
  }
}

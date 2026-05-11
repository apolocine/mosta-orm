// @mostajs/orm/validator — types
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Types publics du ORMConceptValidator. Strictement génériques :
// aucune référence métier à un projet particulier.

import type { EntitySchema } from '../core/types.js'

export type Severity = 'error' | 'warning' | 'info' | 'hint'

/** Un signalement émis par une règle. */
export interface Finding {
  /** ID de la règle (R001-XXX). Stable, utilisé pour ignore et CI. */
  ruleId: string
  severity: Severity
  /** Libellé court (1 phrase). */
  message: string
  location: {
    file?: string
    line?: number
    schema?: string
    field?: string
  }
  /** Suggestion humaine — peut contenir un diff multilignes. */
  suggestion: string
  /** True si la règle implémente `--fix`. */
  fixable: boolean
  /** Payload structuré pour reporters/CLI customs. */
  contextDataJson?: string
}

/** Rapport complet d'une exécution du validator. */
export interface Report {
  schemaCount: number
  findings: Finding[]
  countBySeverity: Record<Severity, number>
  countByRule: Record<string, number>
  durationMs: number
}

/** Options passées au validator. Tout est optionnel — défauts sensibles. */
export interface ValidateOptions {
  /** Root des fichiers source pour les règles cross-file (R005, R007, R008…). */
  sourceRoot?: string
  /** Override sévérité par règle, ex: { R001: 'error' }. */
  rules?: Record<string, Severity>
  /** Règles à ignorer (ne génèrent aucun finding). */
  ignore?: string[]
  /** Patterns soft-delete connus — extensible par projet. */
  softDeletePatterns?: SoftDeletePattern[]
  /** Champs audit-by reconnus (createdBy, updatedBy, …) pour R016. */
  auditByFields?: string[]
  /** Seuils numériques configurables. */
  thresholds?: Thresholds
}

export interface SoftDeletePattern {
  flag: string         // 'deleted' | 'cancelled' | 'archived' | 'disabled' …
  timestamp: string    // 'deletedAt' | 'cancelledAt' | 'archivedAt' …
}

export interface Thresholds {
  /** R004 — paire de schémas considérée duplicate si ≥ ce ratio. Default 0.7. */
  duplicateEntityJaccard?: number
  /** R012 — fichiers lib considérés similar si jaroWinkler ≥ ce ratio. Default 0.85. */
  duplicateImplJaroWinkler?: number
  /** R015 — lib/ flat si ≥ ce nombre de fichiers à la racine. Default 25. */
  flatLibMaxFiles?: number
}

/** Contexte passé à chaque règle. */
export interface RuleContext {
  schemas: EntitySchema[]
  options: Required<Pick<ValidateOptions, 'softDeletePatterns' | 'auditByFields' | 'thresholds'>> & ValidateOptions
  /** Source files lus si sourceRoot est défini. */
  sourceFiles?: SourceFile[]
}

export interface SourceFile {
  path: string         // chemin absolu
  relPath: string      // relatif au sourceRoot
  content: string      // texte UTF-8
}

/** Contrat d'une règle. */
export interface Rule {
  id: string                  // 'R001-EMPTY-RELATIONS'
  description: string
  defaultSeverity: Severity
  /** Si true, nécessite sourceFiles dans le contexte. */
  needsSource?: boolean
  apply(ctx: RuleContext): Finding[]
}

// ─── Defaults (zéro hardcode métier) ─────────────────────────────

// Patterns soft-delete canoniques (= effacement logique). Volontairement
// minimal : on n'inclut PAS 'cancelled', 'disabled', 'inactive' qui sont
// souvent des patterns métier distincts (annulation, désactivation, etc.).
// Projets peuvent étendre via `softDeletePatterns` option.
export const DEFAULT_SOFT_DELETE_PATTERNS: SoftDeletePattern[] = [
  { flag: 'deleted',   timestamp: 'deletedAt' },
  { flag: 'archived',  timestamp: 'archivedAt' },
  { flag: 'removed',   timestamp: 'removedAt' },
]

export const DEFAULT_AUDIT_BY_FIELDS: string[] = [
  'createdBy', 'updatedBy', 'deletedBy', 'archivedBy',
  'validatedBy', 'scannedBy', 'reviewedBy', 'approvedBy',
]

export const DEFAULT_THRESHOLDS: Required<Thresholds> = {
  duplicateEntityJaccard: 0.7,
  duplicateImplJaroWinkler: 0.85,
  flatLibMaxFiles: 25,
}

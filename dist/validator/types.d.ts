import type { EntitySchema } from '../core/types.js';
export type Severity = 'error' | 'warning' | 'info' | 'hint';
/** Un signalement émis par une règle. */
export interface Finding {
    /** ID de la règle (R001-XXX). Stable, utilisé pour ignore et CI. */
    ruleId: string;
    severity: Severity;
    /** Libellé court (1 phrase). */
    message: string;
    location: {
        file?: string;
        line?: number;
        schema?: string;
        field?: string;
    };
    /** Suggestion humaine — peut contenir un diff multilignes. */
    suggestion: string;
    /** True si la règle implémente `--fix`. */
    fixable: boolean;
    /** Payload structuré pour reporters/CLI customs. */
    contextDataJson?: string;
}
/** Rapport complet d'une exécution du validator. */
export interface Report {
    schemaCount: number;
    findings: Finding[];
    countBySeverity: Record<Severity, number>;
    countByRule: Record<string, number>;
    durationMs: number;
}
/** Options passées au validator. Tout est optionnel — défauts sensibles. */
export interface ValidateOptions {
    /** Root des fichiers source pour les règles cross-file (R005, R007, R008…). */
    sourceRoot?: string;
    /** Override sévérité par règle, ex: { R001: 'error' }. */
    rules?: Record<string, Severity>;
    /** Règles à ignorer (ne génèrent aucun finding). */
    ignore?: string[];
    /** Patterns soft-delete connus — extensible par projet. */
    softDeletePatterns?: SoftDeletePattern[];
    /** Champs audit-by reconnus (createdBy, updatedBy, …) pour R016. */
    auditByFields?: string[];
    /** Seuils numériques configurables. */
    thresholds?: Thresholds;
}
export interface SoftDeletePattern {
    flag: string;
    timestamp: string;
}
export interface Thresholds {
    /** R004 — paire de schémas considérée duplicate si ≥ ce ratio. Default 0.7. */
    duplicateEntityJaccard?: number;
    /** R012 — fichiers lib considérés similar si jaroWinkler ≥ ce ratio. Default 0.85. */
    duplicateImplJaroWinkler?: number;
    /** R015 — lib/ flat si ≥ ce nombre de fichiers à la racine. Default 25. */
    flatLibMaxFiles?: number;
}
/** Contexte passé à chaque règle. */
export interface RuleContext {
    schemas: EntitySchema[];
    options: Required<Pick<ValidateOptions, 'softDeletePatterns' | 'auditByFields' | 'thresholds'>> & ValidateOptions;
    /** Source files lus si sourceRoot est défini. */
    sourceFiles?: SourceFile[];
}
export interface SourceFile {
    path: string;
    relPath: string;
    content: string;
}
/** Contrat d'une règle. */
export interface Rule {
    id: string;
    description: string;
    defaultSeverity: Severity;
    /** Si true, nécessite sourceFiles dans le contexte. */
    needsSource?: boolean;
    apply(ctx: RuleContext): Finding[];
}
export declare const DEFAULT_SOFT_DELETE_PATTERNS: SoftDeletePattern[];
export declare const DEFAULT_AUDIT_BY_FIELDS: string[];
export declare const DEFAULT_THRESHOLDS: Required<Thresholds>;

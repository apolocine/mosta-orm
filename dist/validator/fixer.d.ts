import type { Report } from './types.js';
export interface FixOptions {
    /** Root du projet — utilisé pour scanner les fichiers .ts contenant les schémas. */
    sourceRoot: string;
    /** Mode dry-run : génère diff sans modifier le filesystem. Default true. */
    dryRun?: boolean;
    /** Filtrer les règles à fixer. Default : toutes les règles fixables. */
    rules?: string[];
    /** Backup .bak avant modification. Default true en mode non-dry-run. */
    backup?: boolean;
}
export interface FixResult {
    ruleId: string;
    schema: string;
    field?: string;
    file: string;
    applied: boolean;
    reason?: string;
    diff?: string;
    description: string;
}
export declare function applyFixes(report: Report, opts: FixOptions): Promise<FixResult[]>;
export interface RollbackResult {
    file: string;
    restored: boolean;
    reason?: string;
}
/**
 * Trouve tous les `<file>.bak` dans sourceRoot et les restaure vers `<file>`,
 * puis supprime le `.bak`. Idempotent : si pas de .bak, no-op.
 */
export declare function rollbackFixes(sourceRoot: string): RollbackResult[];

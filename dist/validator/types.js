// @mostajs/orm/validator — types
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Types publics du ORMConceptValidator. Strictement génériques :
// aucune référence métier à un projet particulier.
// ─── Defaults (zéro hardcode métier) ─────────────────────────────
// Patterns soft-delete canoniques (= effacement logique). Volontairement
// minimal : on n'inclut PAS 'cancelled', 'disabled', 'inactive' qui sont
// souvent des patterns métier distincts (annulation, désactivation, etc.).
// Projets peuvent étendre via `softDeletePatterns` option.
export const DEFAULT_SOFT_DELETE_PATTERNS = [
    { flag: 'deleted', timestamp: 'deletedAt' },
    { flag: 'archived', timestamp: 'archivedAt' },
    { flag: 'removed', timestamp: 'removedAt' },
];
export const DEFAULT_AUDIT_BY_FIELDS = [
    'createdBy', 'updatedBy', 'deletedBy', 'archivedBy',
    'validatedBy', 'scannedBy', 'reviewedBy', 'approvedBy',
];
export const DEFAULT_THRESHOLDS = {
    duplicateEntityJaccard: 0.7,
    duplicateImplJaroWinkler: 0.85,
    flatLibMaxFiles: 25,
};

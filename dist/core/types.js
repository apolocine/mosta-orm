// DAL Core Types - Database Abstraction Layer
// Inspired by Hibernate ORM Dialect pattern
// Zero dependency on any specific database driver
// Author: Dr Hamid MADANI drmdh@msn.com
/**
 * Normalize an index `fields` spec to the canonical object form.
 *
 * Accepts the array shorthand `['email', 'name']` (commonly emitted by AI code
 * generators / LLMs) and maps each entry to ascending order. Idempotent on the
 * object form.
 *
 * Fixes the latent bug where `Object.entries(['email'])` yielded a column named
 * `"0"` — silently tolerated by SQLite (a double-quoted unknown identifier is
 * reinterpreted as a string literal) but rejected by strict engines
 * (PostgreSQL / PGlite: `column "0" does not exist`).
 * See docs/ANOMALIES-LOT3-2026-05-25.md §17.
 */
export function normalizeIndexFields(fields) {
    if (Array.isArray(fields)) {
        const out = {};
        for (const f of fields)
            out[f] = 'asc';
        return out;
    }
    return fields ?? {};
}

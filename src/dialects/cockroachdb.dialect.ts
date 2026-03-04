// CockroachDB Dialect — extends PostgresDialect
// Equivalent to org.hibernate.dialect.CockroachDialect (Hibernate ORM 6.4)
// Wire-compatible with PostgreSQL but DDL differences
// Driver: npm install pg (same as PostgreSQL)
// Author: Dr Hamid MADANI drmdh@msn.com

import type { IDialect, DialectType } from '../core/types.js';
import { PostgresDialect } from './postgres.dialect.js';

// ============================================================
// CockroachDBDialect
// ============================================================

class CockroachDBDialect extends PostgresDialect {
  readonly dialectType: DialectType = 'cockroachdb';

  // CockroachDB uses STRING internally (alias for TEXT)
  // We keep TEXT for cross-compatibility — CockroachDB accepts it

  // CockroachDB supports RETURNING like Postgres
  // CockroachDB supports IF NOT EXISTS for tables and indexes

  protected getDialectLabel(): string { return 'CockroachDB'; }
}

// ============================================================
// Factory export
// ============================================================

export function createDialect(): IDialect {
  return new CockroachDBDialect();
}

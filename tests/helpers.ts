// Helpers de test — instancie un dialecte IN-PROCESS isolé (hors singleton/env global)
// et les repositories associés, à partir des schémas de fixtures.
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { createIsolatedDialect, BaseRepository } from '../src/index.js';
import type { IDialect } from '../src/index.js';
import { CategorySchema, ProductSchema, OrderSchema, ALL_SCHEMAS } from './fixtures/schemas.js';

export interface InProcessDialect {
  dialect: string;
  uri: string;
  label: string;
}

/** Dialectes testables sans aucune infra (mémoire / WASM / in-process). */
export const IN_PROCESS_DIALECTS: InProcessDialect[] = [
  { dialect: 'sqlite', uri: ':memory:', label: 'SQLite (better-sqlite3)' },
  { dialect: 'sqljs', uri: ':memory:', label: 'sql.js (WASM)' },
  { dialect: 'pglite', uri: ':memory:', label: 'pglite (WASM)' },
  { dialect: 'duckdb', uri: ':memory:', label: 'DuckDB (in-process)' },
];

export interface TestRepos {
  dialect: IDialect;
  cat: BaseRepository<Record<string, unknown>>;
  prod: BaseRepository<Record<string, unknown>>;
  order: BaseRepository<Record<string, unknown>>;
}

/** Crée un dialecte isolé + les 3 repositories de test, schéma déjà initialisé. */
export async function setupRepos(cfg: InProcessDialect): Promise<TestRepos> {
  const dialect = await createIsolatedDialect(
    // schemaStrategy: 'create' → initSchema émet le DDL (CREATE TABLE/INDEX).
    { dialect: cfg.dialect as never, uri: cfg.uri, schemaStrategy: 'create' },
    ALL_SCHEMAS,
  );
  return {
    dialect,
    cat: new BaseRepository(CategorySchema, dialect),
    prod: new BaseRepository(ProductSchema, dialect),
    order: new BaseRepository(OrderSchema, dialect),
  };
}

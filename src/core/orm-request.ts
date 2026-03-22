// OrmRequest / OrmResponse — Canonical format for ORM operations
// Used by @mostajs/net transports to communicate with EntityService
// Pattern: Request/Response (the most conventional in software engineering)
// Author: Dr Hamid MADANI drmdh@msn.com

import type { FilterQuery, QueryOptions, SortDirection, AggregateStage } from './types.js';

// ============================================================
// OrmRequest — a request addressed to the ORM
// ============================================================

export type OrmOperation =
  | 'findAll'
  | 'findOne'
  | 'findById'
  | 'create'
  | 'update'
  | 'delete'
  | 'deleteMany'
  | 'count'
  | 'search'
  | 'aggregate'
  | 'upsert'
  | 'stream';

export interface OrmRequest {
  /** Operation to perform */
  op: OrmOperation;

  /** Target entity name (e.g. 'User', 'Article') — must be registered in the schema registry */
  entity: string;

  /** Entity ID — for findById, update, delete */
  id?: string;

  /** Filter query — for findAll, findOne, count, deleteMany, upsert */
  filter?: FilterQuery;

  /** Data payload — for create, update, upsert */
  data?: Record<string, unknown>;

  /** Query options — sort, limit, skip, select, exclude */
  options?: QueryOptions;

  /** Relations to include (populate/join) */
  relations?: string[];

  /** Search query string — for search operation */
  query?: string;

  /** Search fields — for search operation */
  searchFields?: string[];

  /** Aggregate pipeline stages — for aggregate operation */
  stages?: AggregateStage[];
}

// ============================================================
// OrmResponse — result of an ORM operation
// ============================================================

export interface OrmResponse {
  /** Operation status */
  status: 'ok' | 'error';

  /** Result data (single entity, array, count, etc.) */
  data?: unknown;

  /** Error details (when status === 'error') */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Pagination / count metadata */
  metadata?: {
    count?: number;
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

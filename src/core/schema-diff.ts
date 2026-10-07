// Schema Diff — Compare two EntitySchemas and produce migration operations
// Equivalent to Hibernate hbm2ddl.auto = update (diff-based schema evolution)
// Author: Dr Hamid MADANI drmdh@msn.com

import type { EntitySchema, FieldDef, IndexDef, FieldType } from './types.js';

// ============================================================
// Diff Types
// ============================================================

export type DiffOperation =
  | { type: 'addField'; entity: string; field: string; def: FieldDef }
  | { type: 'removeField'; entity: string; field: string }
  | { type: 'alterField'; entity: string; field: string; from: FieldDef; to: FieldDef }
  | { type: 'addIndex'; entity: string; index: IndexDef }
  | { type: 'removeIndex'; entity: string; index: IndexDef }
  | { type: 'addEntity'; schema: EntitySchema }
  | { type: 'removeEntity'; entity: string; collection: string }
  | { type: 'renameCollection'; entity: string; from: string; to: string }
  | { type: 'addTimestamps'; entity: string }
  | { type: 'removeTimestamps'; entity: string }
  | { type: 'addSoftDelete'; entity: string }
  | { type: 'removeSoftDelete'; entity: string }
  | { type: 'addDiscriminator'; entity: string; field: string; value: string }
  | { type: 'removeDiscriminator'; entity: string; field: string };

// ============================================================
// Diff function
// ============================================================

/**
 * Compare two sets of EntitySchemas and produce a list of migration operations.
 *
 * @param oldSchemas - current state (from DB or snapshot)
 * @param newSchemas - desired state (from code)
 * @returns list of DiffOperations needed to migrate from old to new
 */
export function diffSchemas(oldSchemas: EntitySchema[], newSchemas: EntitySchema[]): DiffOperation[] {
  const ops: DiffOperation[] = [];

  const oldMap = new Map(oldSchemas.map(s => [s.name, s]));
  const newMap = new Map(newSchemas.map(s => [s.name, s]));

  // New entities
  for (const [name, schema] of newMap) {
    if (!oldMap.has(name)) {
      ops.push({ type: 'addEntity', schema });
    }
  }

  // Removed entities
  for (const [name, schema] of oldMap) {
    if (!newMap.has(name)) {
      ops.push({ type: 'removeEntity', entity: name, collection: schema.collection });
    }
  }

  // Modified entities
  for (const [name, newSchema] of newMap) {
    const oldSchema = oldMap.get(name);
    if (!oldSchema) continue;

    // Collection rename
    if (oldSchema.collection !== newSchema.collection) {
      ops.push({ type: 'renameCollection', entity: name, from: oldSchema.collection, to: newSchema.collection });
    }

    // Field diffs
    const oldFields = new Set(Object.keys(oldSchema.fields));
    const newFields = new Set(Object.keys(newSchema.fields));

    for (const field of newFields) {
      if (!oldFields.has(field)) {
        ops.push({ type: 'addField', entity: name, field, def: newSchema.fields[field] });
      } else if (!fieldDefsEqual(oldSchema.fields[field], newSchema.fields[field])) {
        ops.push({ type: 'alterField', entity: name, field, from: oldSchema.fields[field], to: newSchema.fields[field] });
      }
    }

    for (const field of oldFields) {
      if (!newFields.has(field)) {
        ops.push({ type: 'removeField', entity: name, field });
      }
    }

    // Index diffs
    for (const idx of newSchema.indexes) {
      if (!oldSchema.indexes.some(i => indexDefsEqual(i, idx))) {
        ops.push({ type: 'addIndex', entity: name, index: idx });
      }
    }
    for (const idx of oldSchema.indexes) {
      if (!newSchema.indexes.some(i => indexDefsEqual(i, idx))) {
        ops.push({ type: 'removeIndex', entity: name, index: idx });
      }
    }

    // Timestamps
    if (!oldSchema.timestamps && newSchema.timestamps) ops.push({ type: 'addTimestamps', entity: name });
    if (oldSchema.timestamps && !newSchema.timestamps) ops.push({ type: 'removeTimestamps', entity: name });

    // Soft-delete
    if (!oldSchema.softDelete && newSchema.softDelete) ops.push({ type: 'addSoftDelete', entity: name });
    if (oldSchema.softDelete && !newSchema.softDelete) ops.push({ type: 'removeSoftDelete', entity: name });

    // Discriminator
    if (!oldSchema.discriminator && newSchema.discriminator) {
      ops.push({ type: 'addDiscriminator', entity: name, field: newSchema.discriminator, value: newSchema.discriminatorValue || '' });
    }
    if (oldSchema.discriminator && !newSchema.discriminator) {
      ops.push({ type: 'removeDiscriminator', entity: name, field: oldSchema.discriminator });
    }
  }

  return ops;
}

// ============================================================
// Migration SQL generation
// ============================================================

/**
 * Generate SQL migration statements from diff operations.
 * Dialect-agnostic (uses standard SQL DDL).
 */
export function generateMigrationSQL(ops: DiffOperation[]): string[] {
  const statements: string[] = [];

  for (const op of ops) {
    switch (op.type) {
      case 'addEntity':
        // CREATE TABLE is handled by initSchema — just note it
        statements.push(`-- CREATE TABLE ${op.schema.collection} (handled by initSchema)`);
        break;
      case 'removeEntity':
        statements.push(`DROP TABLE IF EXISTS "${op.collection}";`);
        break;
      case 'renameCollection':
        statements.push(`ALTER TABLE "${op.from}" RENAME TO "${op.to}";`);
        break;
      case 'addField':
        statements.push(`ALTER TABLE "${op.entity}" ADD COLUMN "${op.field}" ${fieldTypeToSQL(op.def.type)}${op.def.required ? ' NOT NULL' : ''}${op.def.default !== undefined ? ` DEFAULT ${sqlDefault(op.def.default)}` : ''};`);
        break;
      case 'removeField':
        statements.push(`ALTER TABLE "${op.entity}" DROP COLUMN "${op.field}";`);
        break;
      case 'alterField':
        statements.push(`-- ALTER COLUMN "${op.field}" in "${op.entity}": ${op.from.type} → ${op.to.type} (manual review recommended)`);
        statements.push(`ALTER TABLE "${op.entity}" ALTER COLUMN "${op.field}" TYPE ${fieldTypeToSQL(op.to.type)};`);
        break;
      case 'addIndex': {
        const fields = Object.keys(op.index.fields).map(f => `"${f}"`).join(', ');
        const unique = op.index.unique ? 'UNIQUE ' : '';
        statements.push(`CREATE ${unique}INDEX IF NOT EXISTS "idx_${op.entity}_${Object.keys(op.index.fields).join('_')}" ON "${op.entity}" (${fields});`);
        break;
      }
      case 'removeIndex': {
        statements.push(`DROP INDEX IF EXISTS "idx_${op.entity}_${Object.keys(op.index.fields).join('_')}";`);
        break;
      }
      case 'addTimestamps':
        statements.push(`ALTER TABLE "${op.entity}" ADD COLUMN "createdAt" TIMESTAMP;`);
        statements.push(`ALTER TABLE "${op.entity}" ADD COLUMN "updatedAt" TIMESTAMP;`);
        break;
      case 'addSoftDelete':
        statements.push(`ALTER TABLE "${op.entity}" ADD COLUMN "deletedAt" TIMESTAMP;`);
        break;
      case 'addDiscriminator':
        statements.push(`ALTER TABLE "${op.entity}" ADD COLUMN "${op.field}" VARCHAR(100) NOT NULL DEFAULT '${op.value}';`);
        break;
      default:
        statements.push(`-- ${op.type}: manual migration required`);
    }
  }

  return statements;
}

// ============================================================
// Helpers
// ============================================================

function fieldDefsEqual(a: FieldDef, b: FieldDef): boolean {
  return a.type === b.type
    && a.required === b.required
    && a.unique === b.unique
    && JSON.stringify(a.enum) === JSON.stringify(b.enum)
    && JSON.stringify(a.default) === JSON.stringify(b.default);
}

function indexDefsEqual(a: IndexDef, b: IndexDef): boolean {
  return JSON.stringify(a.fields) === JSON.stringify(b.fields)
    && a.unique === b.unique;
}

function fieldTypeToSQL(type: FieldType): string {
  switch (type) {
    case 'string': return 'VARCHAR(255)';
    case 'text': return 'TEXT';
    case 'number': return 'NUMERIC';
    case 'boolean': return 'BOOLEAN';
    case 'date': return 'TIMESTAMP';
    case 'json': return 'TEXT'; // JSON stored as text for portability
    case 'array': return 'TEXT';
    default: return 'TEXT';
  }
}

function sqlDefault(val: unknown): string {
  if (val === null) return 'NULL';
  if (typeof val === 'string') return `'${val}'`;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return `'${JSON.stringify(val)}'`;
}

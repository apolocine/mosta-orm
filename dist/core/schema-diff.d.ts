import type { EntitySchema, FieldDef, IndexDef } from './types.js';
export type DiffOperation = {
    type: 'addField';
    entity: string;
    field: string;
    def: FieldDef;
} | {
    type: 'removeField';
    entity: string;
    field: string;
} | {
    type: 'alterField';
    entity: string;
    field: string;
    from: FieldDef;
    to: FieldDef;
} | {
    type: 'addIndex';
    entity: string;
    index: IndexDef;
} | {
    type: 'removeIndex';
    entity: string;
    index: IndexDef;
} | {
    type: 'addEntity';
    schema: EntitySchema;
} | {
    type: 'removeEntity';
    entity: string;
    collection: string;
} | {
    type: 'renameCollection';
    entity: string;
    from: string;
    to: string;
} | {
    type: 'addTimestamps';
    entity: string;
} | {
    type: 'removeTimestamps';
    entity: string;
} | {
    type: 'addSoftDelete';
    entity: string;
} | {
    type: 'removeSoftDelete';
    entity: string;
} | {
    type: 'addDiscriminator';
    entity: string;
    field: string;
    value: string;
} | {
    type: 'removeDiscriminator';
    entity: string;
    field: string;
};
/**
 * Compare two sets of EntitySchemas and produce a list of migration operations.
 *
 * @param oldSchemas - current state (from DB or snapshot)
 * @param newSchemas - desired state (from code)
 * @returns list of DiffOperations needed to migrate from old to new
 */
export declare function diffSchemas(oldSchemas: EntitySchema[], newSchemas: EntitySchema[]): DiffOperation[];
/**
 * Generate SQL migration statements from diff operations.
 * Dialect-agnostic (uses standard SQL DDL).
 */
export declare function generateMigrationSQL(ops: DiffOperation[]): string[];

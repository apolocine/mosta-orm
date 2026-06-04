import type { EntitySchema } from './types.js';
/**
 * Register a single entity schema into the registry.
 * Equivalent to Hibernate's @Entity annotation scanning.
 */
export declare function registerSchema(schema: EntitySchema): void;
/**
 * Register multiple entity schemas at once (batch registration).
 */
export declare function registerSchemas(schemas: EntitySchema[]): void;
/**
 * Get an entity schema by entity name (e.g. 'Client', 'Ticket')
 * Throws if the entity is not registered.
 */
export declare function getSchema(entityName: string): EntitySchema;
/**
 * Get an entity schema by collection/table name (e.g. 'clients', 'tickets')
 */
export declare function getSchemaByCollection(collection: string): EntitySchema | undefined;
/**
 * Get all registered entity schemas
 */
export declare function getAllSchemas(): EntitySchema[];
/**
 * Get all entity names
 */
export declare function getEntityNames(): string[];
/**
 * Check if an entity is registered
 */
export declare function hasSchema(entityName: string): boolean;
/**
 * Validate all schemas: check that relation targets exist in the registry.
 * Call this at application startup to catch configuration errors early.
 */
export declare function validateSchemas(): {
    valid: boolean;
    errors: string[];
};
/**
 * Clear all registered schemas (useful for testing)
 */
export declare function clearRegistry(): void;

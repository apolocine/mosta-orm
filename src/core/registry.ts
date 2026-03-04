// Entity Registry - Central registry of all entity schemas
// Equivalent to Hibernate's entity_get_info() / EntityManagerFactory metadata
// Generic version — no hardcoded schemas, use registerSchema() / registerSchemas()
// Author: Dr Hamid MADANI drmdh@msn.com
import type { EntitySchema } from './types.js';

/** Map of entity name -> EntitySchema */
const registry = new Map<string, EntitySchema>();

/** Map of collection name -> EntitySchema */
const collectionMap = new Map<string, EntitySchema>();

/**
 * Register a single entity schema into the registry.
 * Equivalent to Hibernate's @Entity annotation scanning.
 */
export function registerSchema(schema: EntitySchema): void {
  registry.set(schema.name, schema);
  collectionMap.set(schema.collection, schema);
}

/**
 * Register multiple entity schemas at once (batch registration).
 */
export function registerSchemas(schemas: EntitySchema[]): void {
  for (const schema of schemas) {
    registerSchema(schema);
  }
}

/**
 * Get an entity schema by entity name (e.g. 'Client', 'Ticket')
 * Throws if the entity is not registered.
 */
export function getSchema(entityName: string): EntitySchema {
  const schema = registry.get(entityName);
  if (!schema) {
    throw new Error(
      `Entity "${entityName}" is not registered. ` +
      `Available entities: ${Array.from(registry.keys()).join(', ')}`
    );
  }
  return schema;
}

/**
 * Get an entity schema by collection/table name (e.g. 'clients', 'tickets')
 */
export function getSchemaByCollection(collection: string): EntitySchema | undefined {
  return collectionMap.get(collection);
}

/**
 * Get all registered entity schemas
 */
export function getAllSchemas(): EntitySchema[] {
  return Array.from(registry.values());
}

/**
 * Get all entity names
 */
export function getEntityNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * Check if an entity is registered
 */
export function hasSchema(entityName: string): boolean {
  return registry.has(entityName);
}

/**
 * Validate all schemas: check that relation targets exist in the registry.
 * Call this at application startup to catch configuration errors early.
 */
export function validateSchemas(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const schema of registry.values()) {
    for (const [field, relation] of Object.entries(schema.relations)) {
      if (!registry.has(relation.target)) {
        errors.push(
          `${schema.name}.${field} references unknown entity "${relation.target}"`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Clear all registered schemas (useful for testing)
 */
export function clearRegistry(): void {
  registry.clear();
  collectionMap.clear();
}

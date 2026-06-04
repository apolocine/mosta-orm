/** Map of entity name -> EntitySchema */
const registry = new Map();
/** Map of collection name -> EntitySchema */
const collectionMap = new Map();
/**
 * Register a single entity schema into the registry.
 * Equivalent to Hibernate's @Entity annotation scanning.
 */
export function registerSchema(schema) {
    registry.set(schema.name, schema);
    collectionMap.set(schema.collection, schema);
}
/**
 * Register multiple entity schemas at once (batch registration).
 */
export function registerSchemas(schemas) {
    for (const schema of schemas) {
        registerSchema(schema);
    }
}
/**
 * Get an entity schema by entity name (e.g. 'Client', 'Ticket')
 * Throws if the entity is not registered.
 */
export function getSchema(entityName) {
    const schema = registry.get(entityName);
    if (!schema) {
        throw new Error(`Entity "${entityName}" is not registered. ` +
            `Available entities: ${Array.from(registry.keys()).join(', ')}`);
    }
    return schema;
}
/**
 * Get an entity schema by collection/table name (e.g. 'clients', 'tickets')
 */
export function getSchemaByCollection(collection) {
    return collectionMap.get(collection);
}
/**
 * Get all registered entity schemas
 */
export function getAllSchemas() {
    return Array.from(registry.values());
}
/**
 * Get all entity names
 */
export function getEntityNames() {
    return Array.from(registry.keys());
}
/**
 * Check if an entity is registered
 */
export function hasSchema(entityName) {
    return registry.has(entityName);
}
/**
 * Validate all schemas: check that relation targets exist in the registry.
 * Call this at application startup to catch configuration errors early.
 */
export function validateSchemas() {
    const errors = [];
    for (const schema of registry.values()) {
        // `relations` is optional in EntitySchema — skip schemas that don't declare
        // any (otherwise Object.entries(undefined) throws
        // "Cannot convert undefined or null to object").
        const relations = schema.relations ?? {};
        for (const [field, relation] of Object.entries(relations)) {
            if (!registry.has(relation.target)) {
                errors.push(`${schema.name}.${field} references unknown entity "${relation.target}"`);
            }
        }
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Clear all registered schemas (useful for testing)
 */
export function clearRegistry() {
    registry.clear();
    collectionMap.clear();
}

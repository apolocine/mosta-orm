/**
 * Base error class for all MostaORM errors
 */
export declare class MostaORMError extends Error {
    constructor(message: string);
}
/**
 * Thrown when an entity is not found by ID or filter
 */
export declare class EntityNotFoundError extends MostaORMError {
    constructor(entityName: string, id?: string);
}
/**
 * Thrown when a database connection fails
 */
export declare class ConnectionError extends MostaORMError {
    constructor(dialect: string, cause?: string);
}
/**
 * Thrown when entity data fails validation
 */
export declare class ValidationError extends MostaORMError {
    constructor(entityName: string, details: string);
}
/**
 * Thrown when a dialect is not found or not supported
 */
export declare class DialectNotFoundError extends MostaORMError {
    constructor(dialect: string);
}

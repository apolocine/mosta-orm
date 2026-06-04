// MostaORM Error Classes
// Author: Dr Hamid MADANI drmdh@msn.com
/**
 * Base error class for all MostaORM errors
 */
export class MostaORMError extends Error {
    constructor(message) {
        super(message);
        this.name = 'MostaORMError';
    }
}
/**
 * Thrown when an entity is not found by ID or filter
 */
export class EntityNotFoundError extends MostaORMError {
    constructor(entityName, id) {
        super(id
            ? `${entityName} with id "${id}" not found`
            : `${entityName} not found`);
        this.name = 'EntityNotFoundError';
    }
}
/**
 * Thrown when a database connection fails
 */
export class ConnectionError extends MostaORMError {
    constructor(dialect, cause) {
        super(`Failed to connect to ${dialect}${cause ? `: ${cause}` : ''}`);
        this.name = 'ConnectionError';
    }
}
/**
 * Thrown when entity data fails validation
 */
export class ValidationError extends MostaORMError {
    constructor(entityName, details) {
        super(`Validation failed for ${entityName}: ${details}`);
        this.name = 'ValidationError';
    }
}
/**
 * Thrown when a dialect is not found or not supported
 */
export class DialectNotFoundError extends MostaORMError {
    constructor(dialect) {
        super(`Dialect "${dialect}" is not supported`);
        this.name = 'DialectNotFoundError';
    }
}

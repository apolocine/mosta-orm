import type { EntitySchema } from '../core/types.js';
import { type Report, type Rule, type ValidateOptions } from './types.js';
declare const DEFAULT_RULES: Rule[];
/** Point d'entrée principal. */
export declare function validateSchemas(schemas: EntitySchema[], options?: ValidateOptions): Promise<Report>;
/** Re-export pour permettre l'enregistrement de règles custom plus tard. */
export { DEFAULT_RULES };

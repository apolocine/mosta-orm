/**
 * Normalize a database document: _id → id, remove __v
 * Works for any dialect output (MongoDB returns _id, SQL returns id)
 */
export declare function normalizeDoc<T = Record<string, unknown>>(doc: any): T;
/**
 * Normalize an array of documents
 */
export declare function normalizeDocs<T = Record<string, unknown>>(docs: any[]): T[];

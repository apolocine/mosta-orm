// Document normalizer — _id → id conversion
// Author: Dr Hamid MADANI drmdh@msn.com

/**
 * Normalize a database document: _id → id, remove __v
 * Works for any dialect output (MongoDB returns _id, SQL returns id)
 */
export function normalizeDoc<T = Record<string, unknown>>(doc: any): T {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  const id = _id?.toString?.() ?? _id ?? rest.id;

  // Recursively normalize populated sub-documents and arrays
  for (const key of Object.keys(rest)) {
    const val = rest[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && val._id !== undefined) {
      rest[key] = normalizeDoc(val);
    } else if (Array.isArray(val)) {
      rest[key] = val.map((item: any) =>
        item && typeof item === 'object' && item._id !== undefined
          ? normalizeDoc(item)
          : item
      );
    }
  }

  return { id, ...rest } as T;
}

/**
 * Normalize an array of documents
 */
export function normalizeDocs<T = Record<string, unknown>>(docs: any[]): T[] {
  return docs.map(d => normalizeDoc<T>(d));
}

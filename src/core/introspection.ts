// Schema introspection — natural key resolution for findById polymorphic
// Author: Dr Hamid MADANI <drmdh@msn.com>
//
// Permet à `BaseRepository.findById()` d'accepter :
//   - une string id (PK lookup, comportement historique)
//   - un objet avec `id` (relation populée par findByIdWithRelations)
//   - un objet avec les fields d'un unique index (natural key lookup)
//
// Inspirations : Hibernate EntityManager.find(Class, key), Prisma
// findUnique({ where }), SQLAlchemy Session.get(Cls, ident).
//
// Doc : docs/TECHNIQUE-INTROSPECTION-FINDONEBYID.md

import type { EntitySchema, IndexDef } from './types.js';

export interface UniqueIndexMatch {
  /** L'index unique du schema qui correspond. */
  indexDef: IndexDef;
  /** Le filtre à appliquer pour retrouver la row. */
  filter: Record<string, unknown>;
}

export type ResolvedLookup =
  | { kind: 'pk'; id: string }
  | { kind: 'natural'; filter: Record<string, unknown>; indexDef: IndexDef }
  | { kind: 'empty' };

/**
 * Erreur levée quand `findById(obj)` ne peut résoudre ni l'`id` ni
 * un index unique matching dans le schema.
 */
export class OrmIntrospectionError extends Error {
  public readonly schemaName: string;
  public readonly input: unknown;
  public readonly availableFields: string[];

  constructor(message: string, schemaName: string, input: unknown, availableFields: string[]) {
    super(message);
    this.name = 'OrmIntrospectionError';
    this.schemaName = schemaName;
    this.input = input;
    this.availableFields = availableFields;
  }
}

/**
 * Cherche un `IndexDef` unique du schema dont **tous** les fields sont
 * présents (non-vides) dans l'objet. Retourne le premier match ; les
 * index uniques sont parcourus dans leur ordre de déclaration dans
 * `schema.indexes`.
 *
 * Un field est "présent" s'il est défini dans l'objet (key own) et que
 * sa valeur n'est ni `undefined`, ni `null`, ni `''`.
 */
export function findMatchingUniqueIndex(
  schema: EntitySchema,
  obj: Record<string, unknown>,
): UniqueIndexMatch | null {
  const uniqueIndexes = (schema.indexes || []).filter(idx => idx.unique === true);
  for (const indexDef of uniqueIndexes) {
    const fieldNames = Object.keys(indexDef.fields);
    if (fieldNames.length === 0) continue;
    const filter: Record<string, unknown> = {};
    let allPresent = true;
    for (const fname of fieldNames) {
      const v = obj[fname];
      if (v === undefined || v === null || v === '') {
        allPresent = false;
        break;
      }
      filter[fname] = v;
    }
    if (allPresent) {
      return { indexDef, filter };
    }
  }
  return null;
}

/**
 * Résout un input findById en stratégie d'accès :
 * - string non-vide → PK lookup
 * - objet avec `id` non-vide → PK lookup
 * - objet avec un unique index matching → natural key lookup
 * - null / undefined / '' → empty (caller décide return null vs throw)
 * - autre objet → throw OrmIntrospectionError
 *
 * @throws {OrmIntrospectionError} si l'objet ne peut être résolu.
 */
export function resolveLookup(
  schema: EntitySchema,
  idOrEntity: unknown,
): ResolvedLookup {
  // Empty/nullish — le caller traduira en null
  if (idOrEntity === null || idOrEntity === undefined || idOrEntity === '') {
    return { kind: 'empty' };
  }

  // String/number PK direct
  if (typeof idOrEntity === 'string') {
    return { kind: 'pk', id: idOrEntity };
  }
  if (typeof idOrEntity === 'number') {
    return { kind: 'pk', id: String(idOrEntity) };
  }

  // Object — introspection
  if (typeof idOrEntity === 'object') {
    const obj = idOrEntity as Record<string, unknown>;

    // 1. `id` field présent → PK lookup
    if ('id' in obj && obj.id !== undefined && obj.id !== null && obj.id !== '') {
      return { kind: 'pk', id: String(obj.id) };
    }

    // 2. Chercher un unique index dont tous les fields sont présents
    const match = findMatchingUniqueIndex(schema, obj);
    if (match) {
      return { kind: 'natural', filter: match.filter, indexDef: match.indexDef };
    }

    // 3. Aucune résolution possible — throw avec message explicite
    const availableUniqueFields = (schema.indexes || [])
      .filter(idx => idx.unique === true)
      .map(idx => Object.keys(idx.fields).join('+'))
      .join(', ');
    const objKeys = Object.keys(obj).join(', ');
    throw new OrmIntrospectionError(
      `Cannot resolve findById on '${schema.name}': object lacks 'id' and no unique index matches. ` +
        `Object fields: [${objKeys}]. ` +
        `Available unique indexes: [${availableUniqueFields || 'none'}].`,
      schema.name,
      idOrEntity,
      Object.keys(obj),
    );
  }

  // Type primitif inattendu (boolean, symbol, function…)
  throw new OrmIntrospectionError(
    `Cannot resolve findById on '${schema.name}': unsupported input type '${typeof idOrEntity}'.`,
    schema.name,
    idOrEntity,
    [],
  );
}

/**
 * Helper public — extrait l'id d'une référence de relation, qu'elle soit :
 * - une string id (cas lazy par défaut)
 * - un objet populé `{ id, ... }` (cas `fetch: 'eager'`)
 * - null / undefined → retourne `''`
 *
 * Utile pour les call-sites consumer qui font des **comparaisons directes**
 * ou des **accès propriété** que l'introspection findById ne peut pas
 * couvrir (JavaScript n'a pas d'operator overloading) :
 *
 * ```ts
 * // Avec opt-in fetch:'eager' sur la relation `project` :
 * import { extractRelId } from '@mostajs/orm'
 *
 * // ❌ Toujours false en eager (object !== string) :
 * if (reg.project === project.id) { ... }
 *
 * // ✅ Safe en lazy ET eager :
 * if (extractRelId(reg.project) === project.id) { ... }
 * ```
 *
 * Pour les call-sites qui appellent `findById(reg.project)`, l'introspection
 * `findById` polymorphique du `BaseRepository` couvre déjà le cas — pas
 * besoin de `extractRelId` là.
 */
export function extractRelId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    return id === null || id === undefined ? '' : String(id);
  }
  return '';
}

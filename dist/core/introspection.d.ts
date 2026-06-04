import type { EntitySchema, IndexDef } from './types.js';
export interface UniqueIndexMatch {
    /** L'index unique du schema qui correspond. */
    indexDef: IndexDef;
    /** Le filtre à appliquer pour retrouver la row. */
    filter: Record<string, unknown>;
}
export type ResolvedLookup = {
    kind: 'pk';
    id: string;
} | {
    kind: 'natural';
    filter: Record<string, unknown>;
    indexDef: IndexDef;
} | {
    kind: 'empty';
};
/**
 * Erreur levée quand `findById(obj)` ne peut résoudre ni l'`id` ni
 * un index unique matching dans le schema.
 */
export declare class OrmIntrospectionError extends Error {
    readonly schemaName: string;
    readonly input: unknown;
    readonly availableFields: string[];
    constructor(message: string, schemaName: string, input: unknown, availableFields: string[]);
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
export declare function findMatchingUniqueIndex(schema: EntitySchema, obj: Record<string, unknown>): UniqueIndexMatch | null;
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
export declare function resolveLookup(schema: EntitySchema, idOrEntity: unknown): ResolvedLookup;
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
export declare function extractRelId(value: unknown): string;

// Author: Dr Hamid MADANI drmdh@msn.com
// Test: Discriminator _type + soft-delete — dialect-agnostic
// Usage: DIALECT=sqlite DB_URI=path.db node tests-scripts/test-discriminator.mjs
//        DIALECT=mongodb DB_URI=mongodb://... node tests-scripts/test-discriminator.mjs
//        DIALECT=postgres DB_URI=postgresql://... node tests-scripts/test-discriminator.mjs
//        DIALECT=oracle DB_URI=oracle://... node tests-scripts/test-discriminator.mjs
import { registerSchemas, getDialect, BaseRepository, clearRegistry } from '../dist/index.js';

const DIALECT = process.env.DIALECT || 'sqlite';
const DB_URI  = process.env.DB_URI  || '/tmp/test-discriminator.db';
const PREFIX  = DIALECT.slice(0, 3); // unique prefix per dialect to avoid model name clashes

// ── Schemas: 2 entity types sharing ONE table (single-table inheritance) ──

// Single-table: all entity types sharing one table must declare ALL columns
// Each type only uses its own fields, but the table has the union
const sharedFields = {
  title:    { type: 'string', required: true },
  body:     { type: 'text' },
  slug:     { type: 'string' },
  headline: { type: 'string' },
};

// Note: all schemas sharing a table must declare softDelete if ANY of them uses it,
// because the DDL is generated from the first schema only (CREATE TABLE IF NOT EXISTS).
const ArticleSchema = {
  name: `${PREFIX}Article`, collection: `${PREFIX}_entities`,
  fields: sharedFields,
  relations: {}, indexes: [], timestamps: true,
  discriminator: '_type', discriminatorValue: 'article',
  softDelete: true,
};

const PageSchema = {
  name: `${PREFIX}Page`, collection: `${PREFIX}_entities`,
  fields: sharedFields,
  relations: {}, indexes: [], timestamps: true,
  discriminator: '_type', discriminatorValue: 'page',
  softDelete: true,
};

// ── Schema with soft-delete only ──

const CommentSchema = {
  name: `${PREFIX}Comment`, collection: `${PREFIX}_comments`,
  fields: { text: { type: 'string', required: true }, author: { type: 'string' } },
  relations: {}, indexes: [], timestamps: true,
  softDelete: true,
};

// ── Schema with BOTH discriminator + soft-delete ──

const NewsSchema = {
  name: `${PREFIX}News`, collection: `${PREFIX}_entities`,
  fields: sharedFields,
  relations: {}, indexes: [], timestamps: true,
  discriminator: '_type', discriminatorValue: 'news', softDelete: true,
};

// ── Setup ────────────────────────────────────────────────────
if (typeof clearRegistry === 'function') clearRegistry();
registerSchemas([ArticleSchema, PageSchema, CommentSchema, NewsSchema]);

const dialect = await getDialect({
  dialect: DIALECT,
  uri: DB_URI,
  schemaStrategy: 'create',
});

await dialect.initSchema([ArticleSchema, PageSchema, CommentSchema, NewsSchema]);

const articleRepo = new BaseRepository(ArticleSchema, dialect);
const pageRepo    = new BaseRepository(PageSchema, dialect);
const commentRepo = new BaseRepository(CommentSchema, dialect);
const newsRepo    = new BaseRepository(NewsSchema, dialect);

const results = {};

// ═══════════════════════════════════════════════════════════
// TEST 1: Create — discriminator injected
// ═══════════════════════════════════════════════════════════
const a1 = await articleRepo.create({ title: 'Article 1', body: 'Body 1' });
const a2 = await articleRepo.create({ title: 'Article 2', body: 'Body 2' });
const p1 = await pageRepo.create({ title: 'Page 1', slug: 'page-1' });
const p2 = await pageRepo.create({ title: 'Page 2', slug: 'page-2' });
const p3 = await pageRepo.create({ title: 'Page 3', slug: 'page-3' });
results.t01_create = a1.id && p1.id ? 'OK' : 'FAIL';

// ═══════════════════════════════════════════════════════════
// TEST 2: findAll — only returns own type
// ═══════════════════════════════════════════════════════════
const articles = await articleRepo.findAll();
const pages    = await pageRepo.findAll();
results.t02_findAll_articles = articles.length === 2 ? 'OK' : `FAIL: expected 2, got ${articles.length}`;
results.t02_findAll_pages    = pages.length === 3 ? 'OK' : `FAIL: expected 3, got ${pages.length}`;

// ═══════════════════════════════════════════════════════════
// TEST 3: findById — respects discriminator (cross-type must return null)
// ═══════════════════════════════════════════════════════════
const foundArticle = await articleRepo.findById(a1.id);
const crossType    = await articleRepo.findById(p1.id);
results.t03_findById_own   = foundArticle?.title === 'Article 1' ? 'OK' : 'FAIL';
results.t03_findById_cross = crossType === null ? 'OK' : 'FAIL: article repo found a page!';

// ═══════════════════════════════════════════════════════════
// TEST 4: findOne — respects discriminator
// ═══════════════════════════════════════════════════════════
const foundPage = await pageRepo.findOne({ slug: 'page-1' });
results.t04_findOne = foundPage?.title === 'Page 1' ? 'OK' : 'FAIL';

// ═══════════════════════════════════════════════════════════
// TEST 5: count — only own type
// ═══════════════════════════════════════════════════════════
results.t05_count_articles = (await articleRepo.count()) === 2 ? 'OK' : 'FAIL';
results.t05_count_pages    = (await pageRepo.count()) === 3 ? 'OK' : 'FAIL';

// ═══════════════════════════════════════════════════════════
// TEST 6: update — respects discriminator (cross-type must fail)
// ═══════════════════════════════════════════════════════════
const updated = await articleRepo.update(a1.id, { title: 'Article 1 Updated' });
const crossUpdate = await articleRepo.update(p1.id, { title: 'Hacked' });
results.t06_update_own   = updated?.title === 'Article 1 Updated' ? 'OK' : 'FAIL';
results.t06_update_cross = crossUpdate === null ? 'OK' : 'FAIL: article repo updated a page!';

// ═══════════════════════════════════════════════════════════
// TEST 7: delete — respects discriminator
// ═══════════════════════════════════════════════════════════
const crossDelete = await articleRepo.delete(p2.id);
const ownDelete   = await articleRepo.delete(a2.id);
results.t07_delete_cross = crossDelete === false ? 'OK' : 'FAIL: article repo deleted a page!';
results.t07_delete_own   = ownDelete === true ? 'OK' : 'FAIL';
results.t07_count_after  = (await articleRepo.count()) === 1 ? 'OK' : 'FAIL';
results.t07_page_safe    = (await pageRepo.count()) === 3 ? 'OK' : 'FAIL: page was deleted!';

// ═══════════════════════════════════════════════════════════
// TEST 8: Soft-delete
// ═══════════════════════════════════════════════════════════
const c1 = await commentRepo.create({ text: 'Comment 1', author: 'Alice' });
const c2 = await commentRepo.create({ text: 'Comment 2', author: 'Bob' });
const c3 = await commentRepo.create({ text: 'Comment 3', author: 'Alice' });

await commentRepo.delete(c1.id);
results.t08_soft_hidden   = (await commentRepo.findAll()).length === 2 ? 'OK' : `FAIL: expected 2, got ${(await commentRepo.findAll()).length}`;
results.t08_soft_findById = (await commentRepo.findById(c1.id)) === null ? 'OK' : 'FAIL: soft-deleted found!';
results.t08_soft_count    = (await commentRepo.count()) === 2 ? 'OK' : 'FAIL';

// ═══════════════════════════════════════════════════════════
// TEST 9: Discriminator + soft-delete combined
// ═══════════════════════════════════════════════════════════
const n1 = await newsRepo.create({ title: 'News 1', headline: 'Breaking' });
const n2 = await newsRepo.create({ title: 'News 2', headline: 'Update' });
results.t09_combined_count = (await newsRepo.count()) === 2 ? 'OK' : 'FAIL';

await newsRepo.delete(n1.id);
results.t09_combined_soft  = (await newsRepo.findAll()).length === 1 ? 'OK' : `FAIL: expected 1, got ${(await newsRepo.findAll()).length}`;
results.t09_article_safe   = (await articleRepo.count()) === 1 ? 'OK' : 'FAIL';

// ═══════════════════════════════════════════════════════════
// TEST 10: search — respects discriminator
// ═══════════════════════════════════════════════════════════
const searchResults = await articleRepo.search('Article');
results.t10_search = searchResults.length === 1 ? 'OK' : `FAIL: expected 1, got ${searchResults.length}`;

// ═══════════════════════════════════════════════════════════
// TEST 11: distinct — respects discriminator
// ═══════════════════════════════════════════════════════════
const distinctSlugs = await pageRepo.distinct('slug', {});
results.t11_distinct = distinctSlugs.length === 3 ? 'OK' : `FAIL: expected 3, got ${distinctSlugs.length}`;

// ═══════════════════════════════════════════════════════════
// TEST 12: upsert — respects discriminator
// ═══════════════════════════════════════════════════════════
await articleRepo.upsert({ title: 'Article 1 Updated' }, { title: 'Article 1 Updated', body: 'Upserted' });
results.t12_upsert = (await articleRepo.count()) === 1 ? 'OK' : `FAIL: expected 1, got ${await articleRepo.count()}`;

// ═══════════════════════════════════════════════════════════
// TEST 13: deleteMany — respects discriminator
// ═══════════════════════════════════════════════════════════
const deletedPages = await pageRepo.deleteMany({});
results.t13_deleteMany    = deletedPages === 3 ? 'OK' : `FAIL: expected 3, got ${deletedPages}`;
results.t13_articles_safe = (await articleRepo.count()) === 1 ? 'OK' : 'FAIL: articles affected!';

// ═══════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════
await dialect.disconnect();
console.log(JSON.stringify(results));

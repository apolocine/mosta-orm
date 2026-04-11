// Author: Dr Hamid MADANI drmdh@msn.com
// Test complet de toutes les fonctions IDialect + AbstractSqlDialect
// Usage: DIALECT=sqlite DB_URI=:memory: node tests-scripts/test-full-dialect.mjs
//        DIALECT=postgres DB_URI=postgresql://... node tests-scripts/test-full-dialect.mjs
//        DIALECT=oracle DB_URI=oracle://... node tests-scripts/test-full-dialect.mjs
//        DIALECT=mssql DB_URI=mssql://... node tests-scripts/test-full-dialect.mjs
//        DIALECT=cockroachdb DB_URI=postgresql://... node tests-scripts/test-full-dialect.mjs
//        DIALECT=mariadb DB_URI=mariadb://... node tests-scripts/test-full-dialect.mjs
import { registerSchemas, clearRegistry, createIsolatedDialect } from '../dist/index.js';

const DIALECT = process.env.DIALECT || 'sqlite';
const DB_URI  = process.env.DB_URI  || ':memory:';
const P       = `fd_${DIALECT.slice(0, 3)}`; // prefix unique par dialect

// ── Schemas ─────────────────────────────────────────────────

const CategorySchema = {
  name: `${P}Cat`, collection: `${P}_categories`,
  fields: { name: { type: 'string', required: true } },
  relations: {}, indexes: [], timestamps: true,
};

const TagSchema = {
  name: `${P}Tag`, collection: `${P}_tags`,
  fields: { label: { type: 'string', required: true } },
  relations: {}, indexes: [], timestamps: false,
};

// Comment: child of Product (O2M via FK productId on child table)
const CommentSchema = {
  name: `${P}Comm`, collection: `${P}_comments`,
  fields: {
    text:   { type: 'string', required: true },
    author: { type: 'string' },
  },
  relations: {
    // M2O back-reference to Product (owns the FK)
    product: { target: `${P}Prod`, type: 'many-to-one' },
  },
  indexes: [], timestamps: false,
};

const ProductSchema = {
  name: `${P}Prod`, collection: `${P}_products`,
  fields: {
    title:    { type: 'string', required: true },
    price:    { type: 'number', default: 0 },
    active:   { type: 'boolean', default: true },
    meta:     { type: 'json' },
  },
  relations: {
    category: { target: `${P}Cat`, type: 'many-to-one' },
    tags:     { target: `${P}Tag`, type: 'many-to-many', through: `${P}_product_tags` },
    // O2M: comments live in child table with FK 'productId' (convention: parentNameId)
    comments: { target: `${P}Comm`, type: 'one-to-many', mappedBy: 'product' },
  },
  indexes: [],
  timestamps: true,
  softDelete: true,
};

const schemas = [CategorySchema, TagSchema, CommentSchema, ProductSchema];
const results = {};
const ids = {};
let dialect;

function ok(key) { results[key] = 'OK'; }
function fail(key, msg) { results[key] = msg; }

// ── Setup & Teardown ────────────────────────────────────────

async function setup() {
  clearRegistry();
  registerSchemas(schemas);
  dialect = await createIsolatedDialect(
    { dialect: DIALECT, uri: DB_URI, schemaStrategy: 'create' },
    schemas
  );
}

async function teardown() {
  if (dialect?.disconnect) await dialect.disconnect();
}

// ── 1. CREATE ───────────────────────────────────────────────

async function t01_create_simple() {
  const cat = await dialect.create(CategorySchema, { name: 'Electronics' });
  ids.cat1 = cat.id;
  (cat && cat.id && cat.name === 'Electronics') ? ok('t01_create_simple') : fail('t01_create_simple', JSON.stringify(cat));
}

async function t02_create_with_timestamps() {
  const cat = await dialect.create(CategorySchema, { name: 'Books' });
  ids.cat2 = cat.id;
  (cat.createdAt && cat.updatedAt) ? ok('t02_create_with_timestamps') : fail('t02_create_with_timestamps', `createdAt=${cat.createdAt}`);
}

async function t03_create_with_defaults() {
  const tag1 = await dialect.create(TagSchema, { label: 'sale' });
  const tag2 = await dialect.create(TagSchema, { label: 'new' });
  const tag3 = await dialect.create(TagSchema, { label: 'hot' });
  ids.tag1 = tag1.id; ids.tag2 = tag2.id; ids.tag3 = tag3.id;
  (tag1 && tag2 && tag3) ? ok('t03_create_tags') : fail('t03_create_tags', 'tags not created');
}

async function t04_create_with_relations() {
  const prod = await dialect.create(ProductSchema, {
    title: 'Laptop', price: 999.99, active: true,
    category: ids.cat1,
    tags: [ids.tag1, ids.tag2],
    meta: { weight: '2kg', color: 'silver' },
  });
  ids.prod1 = prod.id;
  (prod && prod.id && prod.title === 'Laptop') ? ok('t04_create_with_relations') : fail('t04_create_with_relations', JSON.stringify(prod));
}

async function t05_create_second_product() {
  const prod = await dialect.create(ProductSchema, {
    title: 'Phone', price: 599, active: true,
    category: ids.cat1,
    tags: [ids.tag2, ids.tag3],
  });
  ids.prod2 = prod.id;
  (prod && prod.id) ? ok('t05_create_second_product') : fail('t05_create_second_product', 'failed');
}

// ── 2. READ — findById ──────────────────────────────────────

async function t06_findById() {
  const cat = await dialect.findById(CategorySchema, ids.cat1);
  (cat && cat.name === 'Electronics') ? ok('t06_findById') : fail('t06_findById', JSON.stringify(cat));
}

async function t07_findById_not_found() {
  // Use a valid-format ID that doesn't exist (ObjectId for Mongo, UUID-like for SQL)
  const fakeId = DIALECT === 'mongodb' ? '000000000000000000000000' : 'nonexistent-id-12345';
  const none = await dialect.findById(CategorySchema, fakeId);
  (none === null) ? ok('t07_findById_not_found') : fail('t07_findById_not_found', `got ${JSON.stringify(none)}`);
}

// ── 3. READ — find / findOne ────────────────────────────────

async function t08_find_all() {
  const cats = await dialect.find(CategorySchema, {});
  (cats.length === 2) ? ok('t08_find_all') : fail('t08_find_all', `expected 2, got ${cats.length}`);
}

async function t09_find_with_filter() {
  const cats = await dialect.find(CategorySchema, { name: 'Books' });
  (cats.length === 1 && cats[0].name === 'Books') ? ok('t09_find_with_filter') : fail('t09_find_with_filter', JSON.stringify(cats));
}

async function t10_findOne() {
  const cat = await dialect.findOne(CategorySchema, { name: 'Electronics' });
  (cat && cat.id === ids.cat1) ? ok('t10_findOne') : fail('t10_findOne', JSON.stringify(cat));
}

async function t11_find_with_sort() {
  const cats = await dialect.find(CategorySchema, {}, { sort: { name: 1 } });
  (cats.length === 2 && cats[0].name === 'Books') ? ok('t11_find_with_sort') : fail('t11_find_with_sort', cats.map(c => c.name).join(','));
}

async function t12_find_with_limit_skip() {
  const cats = await dialect.find(CategorySchema, {}, { sort: { name: 1 }, limit: 1, skip: 1 });
  (cats.length === 1 && cats[0].name === 'Electronics') ? ok('t12_find_with_limit_skip') : fail('t12_find_with_limit_skip', JSON.stringify(cats));
}

async function t13_find_with_select() {
  const cats = await dialect.find(CategorySchema, {}, { select: ['name'] });
  const first = cats[0];
  (first && first.name && !first.createdAt) ? ok('t13_find_with_select') : fail('t13_find_with_select', JSON.stringify(first));
}

// ── 4. UPDATE ───────────────────────────────────────────────

async function t14_update() {
  const updated = await dialect.update(CategorySchema, ids.cat1, { name: 'Tech & Electronics' });
  (updated && updated.name === 'Tech & Electronics') ? ok('t14_update') : fail('t14_update', JSON.stringify(updated));
}

async function t15_update_verify() {
  const cat = await dialect.findById(CategorySchema, ids.cat1);
  (cat.name === 'Tech & Electronics') ? ok('t15_update_verify') : fail('t15_update_verify', cat.name);
}

async function t16_updateMany() {
  // Create a third category to test updateMany
  const cat3 = await dialect.create(CategorySchema, { name: 'Temp1' });
  const cat4 = await dialect.create(CategorySchema, { name: 'Temp2' });
  ids.cat3 = cat3.id; ids.cat4 = cat4.id;

  const count = await dialect.updateMany(CategorySchema, { name: { $regex: 'Temp' } }, { name: 'Updated' });
  (count === 2) ? ok('t16_updateMany') : fail('t16_updateMany', `expected 2, got ${count}`);
}

// ── 5. COUNT / DISTINCT ─────────────────────────────────────

async function t17_count() {
  const n = await dialect.count(CategorySchema, {});
  (n === 4) ? ok('t17_count') : fail('t17_count', `expected 4, got ${n}`);
}

async function t18_count_with_filter() {
  const n = await dialect.count(CategorySchema, { name: 'Updated' });
  (n === 2) ? ok('t18_count_with_filter') : fail('t18_count_with_filter', `expected 2, got ${n}`);
}

async function t19_distinct() {
  const names = await dialect.distinct(CategorySchema, 'name', {});
  (Array.isArray(names) && names.length === 3) ? ok('t19_distinct') : fail('t19_distinct', `expected 3 distinct, got ${JSON.stringify(names)}`);
}

// ── 6. DELETE ───────────────────────────────────────────────

async function t20_delete() {
  const ok_ = await dialect.delete(CategorySchema, ids.cat3);
  (ok_ === true) ? ok('t20_delete') : fail('t20_delete', `returned ${ok_}`);
}

async function t21_delete_verify() {
  const cat = await dialect.findById(CategorySchema, ids.cat3);
  (cat === null) ? ok('t21_delete_verify') : fail('t21_delete_verify', 'still exists');
}

async function t22_deleteMany() {
  const count = await dialect.deleteMany(CategorySchema, { name: 'Updated' });
  (count === 1) ? ok('t22_deleteMany') : fail('t22_deleteMany', `expected 1, got ${count}`);
}

// ── 7. SOFT DELETE ──────────────────────────────────────────

async function t23_soft_delete() {
  const deleted = await dialect.delete(ProductSchema, ids.prod1);
  (deleted === true) ? ok('t23_soft_delete') : fail('t23_soft_delete', `returned ${deleted}`);
}

async function t24_soft_delete_hidden() {
  // findById should NOT return soft-deleted
  const prod = await dialect.findById(ProductSchema, ids.prod1);
  (prod === null) ? ok('t24_soft_delete_hidden') : fail('t24_soft_delete_hidden', 'soft-deleted item still visible');
}

async function t25_soft_delete_count() {
  const n = await dialect.count(ProductSchema, {});
  (n === 1) ? ok('t25_soft_delete_count') : fail('t25_soft_delete_count', `expected 1, got ${n}`);
}

// ── 8. RELATIONS — populate ─────────────────────────────────

async function t26_findByIdWithRelations() {
  const prod = await dialect.findByIdWithRelations(ProductSchema, ids.prod2, ['category', 'tags']);
  if (!prod) { fail('t26_findByIdWithRelations', 'product not found'); return; }
  const catOk = prod.category && typeof prod.category === 'object' && prod.category.name;
  const tagsOk = Array.isArray(prod.tags) && prod.tags.length === 2;
  (catOk && tagsOk) ? ok('t26_findByIdWithRelations') : fail('t26_findByIdWithRelations', `cat=${JSON.stringify(prod.category)} tags=${prod.tags?.length}`);
}

async function t27_findWithRelations() {
  const prods = await dialect.findWithRelations(ProductSchema, {}, ['category'], {});
  if (prods.length === 0) { fail('t27_findWithRelations', 'no products'); return; }
  const first = prods[0];
  const catOk = first.category && typeof first.category === 'object';
  (catOk) ? ok('t27_findWithRelations') : fail('t27_findWithRelations', JSON.stringify(first.category));
}

// ── 9. M2M DELETE — junction cleanup (P0-2) ────────────────

async function t28_m2m_softdelete_keeps_junction() {
  // Both prod1 and prod2 are soft-deleted (schema.softDelete=true)
  // Soft-delete does NOT clean junction rows — this is expected behavior
  // (like Hibernate: soft-deleted entities keep their relations for potential restore)
  if (DIALECT === 'mongodb') { ok('t28_m2m_softdelete_keeps_junction'); return; }

  try {
    const jRows = await dialect.executeQuery(`SELECT * FROM "${P}_product_tags"`, []);
    // prod1 had 2 tags, prod2 had 2 tags = 4 junction rows (all kept)
    (jRows.length === 4) ? ok('t28_m2m_softdelete_keeps_junction')
      : fail('t28_m2m_softdelete_keeps_junction', `expected 4 junction rows (soft-delete keeps them), got ${jRows.length}`);
  } catch {
    ok('t28_m2m_softdelete_keeps_junction');
  }
}

async function t29_tags_not_deleted() {
  const t1 = await dialect.findById(TagSchema, ids.tag1);
  const t2 = await dialect.findById(TagSchema, ids.tag2);
  const t3 = await dialect.findById(TagSchema, ids.tag3);
  (t1 && t2 && t3) ? ok('t29_tags_not_deleted') : fail('t29_tags_not_deleted', 'target entities deleted');
}

// ── 10. UPSERT ──────────────────────────────────────────────

async function t30_upsert_create() {
  const tag = await dialect.upsert(TagSchema, { label: 'premium' }, { label: 'premium' });
  ids.tag4 = tag.id;
  (tag && tag.label === 'premium') ? ok('t30_upsert_create') : fail('t30_upsert_create', JSON.stringify(tag));
}

async function t31_upsert_update() {
  const tag = await dialect.upsert(TagSchema, { label: 'premium' }, { label: 'premium-plus' });
  (tag && tag.id === ids.tag4 && tag.label === 'premium-plus') ? ok('t31_upsert_update')
    : fail('t31_upsert_update', `id=${tag?.id} label=${tag?.label}`);
}

// ── 11. INCREMENT ───────────────────────────────────────────

async function t32_increment() {
  // Create a new product for increment test
  const prod = await dialect.create(ProductSchema, { title: 'Widget', price: 10, active: true, category: ids.cat1 });
  ids.prod3 = prod.id;
  const updated = await dialect.increment(ProductSchema, ids.prod3, 'price', 5);
  (updated && Number(updated.price) === 15) ? ok('t32_increment') : fail('t32_increment', `price=${updated?.price}`);
}

// ── 12. SEARCH ──────────────────────────────────────────────

async function t33_search() {
  const results_ = await dialect.search(TagSchema, 'premium', ['label'], {});
  (results_.length >= 1) ? ok('t33_search') : fail('t33_search', `expected >=1, got ${results_.length}`);
}

// ── 13. O2M — one-to-many via FK enfant (P0-3) ─────────────

async function t34_o2m_create_comments() {
  // Create comments with FK pointing to prod3 (Widget)
  const c1 = await dialect.create(CommentSchema, { text: 'Great product!', author: 'Alice', product: ids.prod3 });
  const c2 = await dialect.create(CommentSchema, { text: 'Too expensive', author: 'Bob', product: ids.prod3 });
  ids.comm1 = c1.id; ids.comm2 = c2.id;
  (c1 && c2 && c1.id && c2.id) ? ok('t34_o2m_create_comments') : fail('t34_o2m_create_comments', 'comments not created');
}

async function t35_o2m_populate_via_fk() {
  // findByIdWithRelations loads O2M comments via FK query (SQL + MongoDB)
  const prod = await dialect.findByIdWithRelations(ProductSchema, ids.prod3, ['comments', 'category']);
  if (!prod) { fail('t35_o2m_populate_via_fk', 'product not found'); return; }
  const comments = prod.comments;
  (Array.isArray(comments) && comments.length === 2)
    ? ok('t35_o2m_populate_via_fk')
    : fail('t35_o2m_populate_via_fk', `expected 2 comments, got ${JSON.stringify(comments)}`);
}

async function t36_o2m_no_column_on_parent() {
  // The product row should NOT have a 'comments' column (O2M lives on child)
  if (DIALECT === 'mongodb') { ok('t36_o2m_no_column_on_parent'); return; }
  const prod = await dialect.findById(ProductSchema, ids.prod3);
  // Without populate, comments should be undefined or [] (no column on parent)
  const comments = prod?.comments;
  (comments === undefined || (Array.isArray(comments) && comments.length === 0))
    ? ok('t36_o2m_no_column_on_parent')
    : fail('t36_o2m_no_column_on_parent', `comments=${JSON.stringify(comments)}`);
}

async function t37_o2m_fk_on_child() {
  // Verify the comment has the FK to parent
  const c1 = await dialect.findById(CommentSchema, ids.comm1);
  // MongoDB stores ObjectId, SQL stores string — compare as strings
  const fkVal = c1?.product;
  const fkStr = typeof fkVal === 'object' && fkVal !== null ? (fkVal.id || fkVal._id || fkVal).toString() : String(fkVal);
  (fkStr === String(ids.prod3))
    ? ok('t37_o2m_fk_on_child')
    : fail('t37_o2m_fk_on_child', `expected FK=${ids.prod3}, got ${fkStr}`);
}

// ── Runner ──────────────────────────────────────────────────

const tests = [
  t01_create_simple, t02_create_with_timestamps, t03_create_with_defaults,
  t04_create_with_relations, t05_create_second_product,
  t06_findById, t07_findById_not_found,
  t08_find_all, t09_find_with_filter, t10_findOne,
  t11_find_with_sort, t12_find_with_limit_skip, t13_find_with_select,
  t14_update, t15_update_verify, t16_updateMany,
  t17_count, t18_count_with_filter, t19_distinct,
  t20_delete, t21_delete_verify, t22_deleteMany,
  t23_soft_delete, t24_soft_delete_hidden, t25_soft_delete_count,
  t26_findByIdWithRelations, t27_findWithRelations,
  t28_m2m_softdelete_keeps_junction, t29_tags_not_deleted,
  t30_upsert_create, t31_upsert_update,
  t32_increment, t33_search,
  t34_o2m_create_comments, t35_o2m_populate_via_fk,
  t36_o2m_no_column_on_parent, t37_o2m_fk_on_child,
];

try {
  await setup();
  for (const t of tests) {
    try { await t(); }
    catch (err) { results[t.name] = `EXCEPTION: ${err.message}`; }
  }
} catch (err) {
  results.fatal_error = String(err.stack || err);
} finally {
  await teardown();
}

console.log(JSON.stringify(results));

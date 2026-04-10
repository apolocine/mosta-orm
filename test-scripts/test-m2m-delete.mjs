// Author: Dr Hamid MADANI drmdh@msn.com
// Test P0-2 : M2M delete — junction table cleanup (multi-dialect)
// Usage: DIALECT=sqlite DB_URI=:memory: node tests-scripts/test-m2m-delete.mjs
//        DIALECT=postgres DB_URI=postgresql://... node tests-scripts/test-m2m-delete.mjs
//        DIALECT=mongodb DB_URI=mongodb://... node tests-scripts/test-m2m-delete.mjs
import { registerSchemas, clearRegistry, createIsolatedDialect } from '../dist/index.js';

const DIALECT = process.env.DIALECT || 'sqlite';
const DB_URI  = process.env.DB_URI  || ':memory:';
const PREFIX  = `m2d_${DIALECT.slice(0, 3)}`;

// ── Schemas ─────────────────────────────────────────────────

const RoleSchema = {
  name: `${PREFIX}Role`, collection: `${PREFIX}_roles`,
  fields: { name: { type: 'string', required: true } },
  relations: {}, indexes: [], timestamps: false,
};

const UserSchema = {
  name: `${PREFIX}User`, collection: `${PREFIX}_users`,
  fields: { name: { type: 'string', required: true } },
  relations: {
    roles: {
      target: `${PREFIX}Role`,
      type: 'many-to-many',
      through: `${PREFIX}_user_roles`,
    },
  },
  indexes: [], timestamps: false,
};

// ── Setup ───────────────────────────────────────────────────

const results = {};
function record(key, value) { results[key] = value; }

let dialect;

// IDs auto-generes — stockes apres creation
const ids = {};

async function setup() {
  clearRegistry();
  registerSchemas([UserSchema, RoleSchema]);
  dialect = await createIsolatedDialect(
    { dialect: DIALECT, uri: DB_URI, schemaStrategy: 'create' },
    [UserSchema, RoleSchema]
  );
}

async function teardown() {
  try { await dialect.deleteMany(UserSchema, {}); } catch {}
  try { await dialect.deleteMany(RoleSchema, {}); } catch {}
  if (dialect?.disconnect) await dialect.disconnect();
}

// ── Helper generique — query junction via executeQuery (IDialect) ──

async function getJunctionCount() {
  if (DIALECT === 'mongodb') return null; // Mongo: M2M = array, pas de junction

  // executeQuery est maintenant dans IDialect (abstrait + sqlite)
  const table = `${PREFIX}_user_roles`;
  try {
    const rows = await dialect.executeQuery(`SELECT * FROM "${table}"`, []);
    return rows.length;
  } catch {
    return -1;
  }
}

// ── Tests ───────────────────────────────────────────────────

async function t01_create_roles() {
  const r1 = await dialect.create(RoleSchema, { name: 'Admin' });
  const r2 = await dialect.create(RoleSchema, { name: 'Editor' });
  const r3 = await dialect.create(RoleSchema, { name: 'Viewer' });
  ids.r1 = r1.id; ids.r2 = r2.id; ids.r3 = r3.id;
  record('t01_create_roles', (r1 && r2 && r3) ? 'OK' : 'roles not created');
}

async function t02_create_user_with_m2m() {
  const user = await dialect.create(UserSchema, {
    name: 'Alice', roles: [ids.r1, ids.r2],
  });
  ids.u1 = user.id;
  record('t02_create_user_with_m2m', user ? 'OK' : 'user not created');
}

async function t03_junction_has_rows_after_create() {
  const count = await getJunctionCount();
  if (count === null) {
    // MongoDB: verifier l'array roles
    const user = await dialect.findById(UserSchema, ids.u1);
    const roles = user?.roles;
    record('t03_junction_has_rows_after_create',
      (Array.isArray(roles) && roles.length === 2) ? 'OK'
        : `expected 2 roles, got ${JSON.stringify(roles)}`);
    return;
  }
  record('t03_junction_has_rows_after_create',
    count === 2 ? 'OK' : `expected 2 junction rows, got ${count}`);
}

async function t04_delete_cleans_junction() {
  const deleted = await dialect.delete(UserSchema, ids.u1);
  if (!deleted) { record('t04_delete_cleans_junction', 'delete returned false'); return; }

  const count = await getJunctionCount();
  if (count === null) {
    const user = await dialect.findById(UserSchema, ids.u1);
    record('t04_delete_cleans_junction', !user ? 'OK' : 'user still exists');
    return;
  }
  record('t04_delete_cleans_junction',
    count === 0 ? 'OK' : `expected 0 junction rows after delete, got ${count}`);
}

async function t05_roles_not_deleted() {
  const r1 = await dialect.findById(RoleSchema, ids.r1);
  const r2 = await dialect.findById(RoleSchema, ids.r2);
  record('t05_roles_not_deleted',
    (r1 && r2) ? 'OK' : 'target entities were deleted (wrong!)');
}

async function t06_deleteMany_cleans_junction() {
  // Creer 2 users avec des roles
  const u2 = await dialect.create(UserSchema, { name: 'Bob', roles: [ids.r1, ids.r3] });
  const u3 = await dialect.create(UserSchema, { name: 'Charlie', roles: [ids.r2] });
  ids.u2 = u2.id; ids.u3 = u3.id;

  const before = await getJunctionCount();

  const count = await dialect.deleteMany(UserSchema, {
    id: { $in: [ids.u2, ids.u3] },
  });

  if (count !== 2) {
    record('t06_deleteMany_cleans_junction', `deleteMany returned ${count}, expected 2`);
    return;
  }

  const after = await getJunctionCount();
  if (after === null) {
    const u2c = await dialect.findById(UserSchema, ids.u2);
    const u3c = await dialect.findById(UserSchema, ids.u3);
    record('t06_deleteMany_cleans_junction',
      (!u2c && !u3c) ? 'OK' : 'users still exist');
    return;
  }
  record('t06_deleteMany_cleans_junction',
    after === 0 ? 'OK' : `expected 0 junction rows, got ${after} (was ${before})`);
}

async function t07_roles_still_exist_after_deleteMany() {
  const r1 = await dialect.findById(RoleSchema, ids.r1);
  const r2 = await dialect.findById(RoleSchema, ids.r2);
  const r3 = await dialect.findById(RoleSchema, ids.r3);
  record('t07_roles_still_exist_after_deleteMany',
    (r1 && r2 && r3) ? 'OK' : 'roles were deleted by deleteMany (wrong!)');
}

// ── Runner ──────────────────────────────────────────────────

try {
  await setup();
  await t01_create_roles();
  await t02_create_user_with_m2m();
  await t03_junction_has_rows_after_create();
  await t04_delete_cleans_junction();
  await t05_roles_not_deleted();
  await t06_deleteMany_cleans_junction();
  await t07_roles_still_exist_after_deleteMany();
} catch (err) {
  results.fatal_error = String(err.stack || err);
} finally {
  await teardown();
}

console.log(JSON.stringify(results));

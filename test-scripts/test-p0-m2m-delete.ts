// Test P0-2 : M2M delete — junction table cleanup
// Author: Dr Hamid MADANI drmdh@msn.com
// Verifie que delete() et deleteMany() nettoient la junction table

import { createIsolatedDialect, registerSchemas, clearRegistry } from '../dist/index.js';
import type { EntitySchema } from '../dist/index.js';

// ============================================================
// Schemas de test
// ============================================================

const UserSchema: EntitySchema = {
  name: 'User',
  collection: 'users',
  fields: {
    id:   { type: 'string', required: true },
    name: { type: 'string', required: true },
  },
  relations: {
    roles: {
      target: 'Role',
      type: 'many-to-many',
      through: 'user_roles',
    },
  },
  indexes: [],
  timestamps: false,
};

const RoleSchema: EntitySchema = {
  name: 'Role',
  collection: 'roles',
  fields: {
    id:   { type: 'string', required: true },
    name: { type: 'string', required: true },
  },
  relations: {},
  indexes: [],
  timestamps: false,
};

// ============================================================
// Helpers
// ============================================================

let dialect: any;
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function queryJunction(): Promise<any[]> {
  // Acces brut a la DB SQLite pour verifier la junction table
  const db = (dialect as any).db;
  return db.prepare('SELECT * FROM user_roles').all();
}

async function setup() {
  clearRegistry();
  registerSchemas([UserSchema, RoleSchema]);
  dialect = await createIsolatedDialect(
    { dialect: 'sqlite' as any, uri: ':memory:', schemaStrategy: 'create' as any },
    [UserSchema, RoleSchema]
  );
}

async function teardown() {
  if (dialect?.disconnect) await dialect.disconnect();
}

// ============================================================
// Tests
// ============================================================

async function testDeleteCleansJunction() {
  console.log('\n--- Test 1: delete() nettoie la junction table ---');

  // 1. Creer 2 roles
  const role1 = await dialect.create(RoleSchema, { id: 'r1', name: 'Admin' });
  const role2 = await dialect.create(RoleSchema, { id: 'r2', name: 'Editor' });
  assert(role1 != null, 'Role Admin cree');
  assert(role2 != null, 'Role Editor cree');

  // 2. Creer un user avec 2 roles (M2M)
  const user = await dialect.create(UserSchema, { id: 'u1', name: 'Alice', roles: ['r1', 'r2'] });
  assert(user != null, 'User Alice cree');

  // 3. Verifier que la junction table contient 2 lignes
  let jRows = await queryJunction();
  assert(jRows.length === 2, `Junction a 2 lignes apres create (got ${jRows.length})`);

  // 4. Supprimer le user
  const deleted = await dialect.delete(UserSchema, 'u1');
  assert(deleted === true, 'delete() retourne true');

  // 5. Verifier que la junction table est VIDE
  jRows = await queryJunction();
  assert(jRows.length === 0, `Junction vide apres delete (got ${jRows.length})`);
}

async function testDeleteManyCleasJunction() {
  console.log('\n--- Test 2: deleteMany() nettoie la junction table ---');

  // 1. Creer 2 roles + 3 users avec des roles
  await dialect.create(RoleSchema, { id: 'r10', name: 'Viewer' });
  await dialect.create(RoleSchema, { id: 'r11', name: 'Moderator' });

  await dialect.create(UserSchema, { id: 'u10', name: 'Bob',     roles: ['r10', 'r11'] });
  await dialect.create(UserSchema, { id: 'u11', name: 'Charlie', roles: ['r10'] });
  await dialect.create(UserSchema, { id: 'u12', name: 'Diana',   roles: ['r11'] });

  // 2. Verifier junction : 2 + 1 + 1 = 4 lignes
  let jRows = await queryJunction();
  assert(jRows.length === 4, `Junction a 4 lignes apres creates (got ${jRows.length})`);

  // 3. deleteMany — supprimer Bob et Charlie (name IN)
  const count = await dialect.deleteMany(UserSchema, { id: { $in: ['u10', 'u11'] } });
  assert(count === 2, `deleteMany retourne 2 (got ${count})`);

  // 4. Verifier que seule la ligne de Diana reste dans la junction
  jRows = await queryJunction();
  assert(jRows.length === 1, `Junction a 1 ligne apres deleteMany (got ${jRows.length})`);

  // 5. Verifier que c'est bien la ligne de Diana
  const dianaJunction = jRows[0];
  assert(
    dianaJunction.userId === 'u12' || dianaJunction.userId === 'u12',
    `Ligne restante = Diana (userId=${dianaJunction.userId || dianaJunction.userId})`
  );
}

async function testDeleteDoesNotAffectOtherEntities() {
  console.log('\n--- Test 3: delete() ne supprime pas les entites cibles (roles) ---');

  // Apres les tests precedents, les roles r10 et r11 doivent encore exister
  const role10 = await dialect.findById(RoleSchema, 'r10');
  const role11 = await dialect.findById(RoleSchema, 'r11');
  assert(role10 != null, 'Role r10 existe toujours apres delete des users');
  assert(role11 != null, 'Role r11 existe toujours apres delete des users');
}

async function testSoftDeleteDoesNotCleanJunction() {
  console.log('\n--- Test 4: soft-delete ne nettoie PAS la junction (comportement attendu) ---');

  // Schema avec softDelete
  const SoftUserSchema: EntitySchema = {
    ...UserSchema,
    name: 'SoftUser',
    collection: 'soft_users',
    softDelete: true,
  };

  // Re-init avec le nouveau schema
  clearRegistry();
  registerSchemas([SoftUserSchema, RoleSchema]);
  if (dialect?.disconnect) await dialect.disconnect();
  dialect = await createIsolatedDialect(
    { dialect: 'sqlite' as any, uri: ':memory:', schemaStrategy: 'create' as any },
    [SoftUserSchema, RoleSchema]
  );

  await dialect.create(RoleSchema, { id: 'sr1', name: 'SoftRole' });
  await dialect.create(SoftUserSchema, { id: 'su1', name: 'SoftAlice', roles: ['sr1'] });

  // Junction table name = softuser_roles (basee sur schema.name.toLowerCase())
  const db = (dialect as any).db;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const junctionTable = tables.find((t: any) =>
    t.name.includes('_roles') || t.name.includes('user_roles')
  );

  if (junctionTable) {
    let jRows = db.prepare(`SELECT * FROM "${junctionTable.name}"`).all();
    assert(jRows.length === 1, `Junction a 1 ligne avant soft-delete (got ${jRows.length})`);

    // Soft-delete
    await dialect.delete(SoftUserSchema, 'su1');

    jRows = db.prepare(`SELECT * FROM "${junctionTable.name}"`).all();
    assert(jRows.length === 1, `Junction a toujours 1 ligne apres soft-delete (got ${jRows.length})`);
  } else {
    console.log('  ⚠️  Pas de junction table trouvee pour SoftUser — skip');
  }
}

// ============================================================
// Runner
// ============================================================

async function main() {
  console.log('========================================');
  console.log('TEST P0-2 : M2M delete junction cleanup');
  console.log('========================================');

  try {
    await setup();
    await testDeleteCleansJunction();
    await testDeleteManyCleasJunction();
    await testDeleteDoesNotAffectOtherEntities();
    await testSoftDeleteDoesNotCleanJunction();
  } catch (err) {
    console.error('\n💥 Erreur fatale:', err);
    failed++;
  } finally {
    await teardown();
  }

  console.log('\n========================================');
  console.log(`Resultats: ${passed} passed, ${failed} failed`);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();

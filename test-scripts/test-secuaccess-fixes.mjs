// Author: Dr Hamid MADANI drmdh@msn.com
// Test: Simulates SecuAccessPro patterns (roles, permissions, users)
// with many-to-many relations on SQL — validates fixes B, C, D
//
// Schemas mirror SecuAccessPro: User ←m2m→ Role ←m2m→ Permission
//
// Usage: PG_URI=postgresql://... node tests-scripts/test-secuaccess-fixes.mjs
import { registerSchemas, getDialect, BaseRepository, clearRegistry, disconnectDialect } from '../dist/index.js';
// const DB_URI  = process.env.PG_URI || process.env.DB_URI || '/tmp/test-fixes.db';
         
const DIALECT = process.env.DIALECT || 'postgres';
const DB_URI  = process.env.DB_URI || process.env.PG_URI || '/tmp/test-fixes.db';

// ── Schemas (mirrors SecuAccessPro) ──────────────────────

const PermissionSchema = {
  name: 'FxPerm', collection: 'fx_permissions',
  fields: {
    name: { type: 'string', required: true, unique: true },
    description: { type: 'string' },
  },
  relations: {}, indexes: [], timestamps: true,
};

const RoleSchema = {
  name: 'FxRole', collection: 'fx_roles',
  fields: {
    name: { type: 'string', required: true, unique: true },
    description: { type: 'string' },
  },
  relations: {
    permissions: { target: 'FxPerm', type: 'many-to-many', through: 'fx_role_permissions' },
  },
  indexes: [], timestamps: true,
};

const UserSchema = {
  name: 'FxUser', collection: 'fx_users',
  fields: {
    email: { type: 'string', required: true, unique: true },
    firstName: { type: 'string', required: true },
    lastName: { type: 'string', required: true },
    status: { type: 'string', default: 'active' },
  },
  relations: {
    roles: { target: 'FxRole', type: 'many-to-many', through: 'fx_user_roles' },
  },
  indexes: [], timestamps: true,
};

// ── Setup ────────────────────────────────────────────────

await disconnectDialect();
clearRegistry();
registerSchemas([PermissionSchema, RoleSchema, UserSchema]);

const dialect = await getDialect({
  dialect: DIALECT,
  uri: DB_URI,
  schemaStrategy: 'create',
});

await dialect.initSchema([PermissionSchema, RoleSchema, UserSchema]);

const permRepo = new BaseRepository(PermissionSchema, dialect);
const roleRepo = new BaseRepository(RoleSchema, dialect);
const userRepo = new BaseRepository(UserSchema, dialect);

const results = {};

// ═══════════════════════════════════════════════════════════
// SEED: Create permissions, roles with m2m, users with m2m
// ═══════════════════════════════════════════════════════════

const p1 = await permRepo.create({ name: 'admin:access', description: 'Admin access' });
const p2 = await permRepo.create({ name: 'client:view', description: 'View clients' });
const p3 = await permRepo.create({ name: 'client:edit', description: 'Edit clients' });
const p4 = await permRepo.create({ name: 'ticket:view', description: 'View tickets' });

const adminRole = await roleRepo.create({ name: 'admin', description: 'Admin', permissions: [p1.id, p2.id, p3.id, p4.id] });
const agentRole = await roleRepo.create({ name: 'agent', description: 'Agent', permissions: [p2.id, p4.id] });
const viewerRole = await roleRepo.create({ name: 'viewer', description: 'Viewer', permissions: [p2.id] });

const u1 = await userRepo.create({ email: 'admin@test.dz', firstName: 'Admin', lastName: 'Test', roles: [adminRole.id] });
const u2 = await userRepo.create({ email: 'agent1@test.dz', firstName: 'Agent1', lastName: 'Test', roles: [agentRole.id] });
const u3 = await userRepo.create({ email: 'agent2@test.dz', firstName: 'Agent2', lastName: 'Test', roles: [agentRole.id] });
const u4 = await userRepo.create({ email: 'viewer@test.dz', firstName: 'Viewer', lastName: 'Test', roles: [viewerRole.id] });
const u5 = await userRepo.create({ email: 'multi@test.dz', firstName: 'Multi', lastName: 'Test', roles: [adminRole.id, agentRole.id] });

results.t01_seed = (await permRepo.count()) === 4 && (await roleRepo.count()) === 3 && (await userRepo.count()) === 5 ? 'OK' : 'FAIL';

// ═══════════════════════════════════════════════════════════
// FIX B: Count users per role via findWithRelations
// (replaces: uRepo.count({ role: role.name }))
// ═══════════════════════════════════════════════════════════

const usersWithRoles = await userRepo.findWithRelations({}, ['roles']);

// Count per role
const countMap = {};
for (const u of usersWithRoles) {
  const userRoles = u.roles ?? [];
  for (const role of userRoles) {
    const rid = typeof role === 'string' ? role : role.id;
    countMap[rid] = (countMap[rid] || 0) + 1;
  }
}

results.t02_fixB_admin_count = countMap[adminRole.id] === 2 ? 'OK' : `FAIL: expected 2, got ${countMap[adminRole.id]}`;
results.t03_fixB_agent_count = countMap[agentRole.id] === 3 ? 'OK' : `FAIL: expected 3, got ${countMap[agentRole.id]}`;
results.t04_fixB_viewer_count = countMap[viewerRole.id] === 1 ? 'OK' : `FAIL: expected 1, got ${countMap[viewerRole.id]}`;

// Verify: filter users for a specific role
const adminUsers = usersWithRoles.filter(u =>
  (u.roles ?? []).some(r => (typeof r === 'string' ? r : r.id) === adminRole.id)
);
results.t05_fixB_filter_admin = adminUsers.length === 2 ? 'OK' : `FAIL: expected 2, got ${adminUsers.length}`;

const agentUsers = usersWithRoles.filter(u =>
  (u.roles ?? []).some(r => (typeof r === 'string' ? r : r.id) === agentRole.id)
);
results.t06_fixB_filter_agent = agentUsers.length === 3 ? 'OK' : `FAIL: expected 3, got ${agentUsers.length}`;

// ═══════════════════════════════════════════════════════════
// FIX C: removePermissionFromAll via pull()
// (replaces: updateMany({}, { $pull: { permissions: id } }))
// ═══════════════════════════════════════════════════════════

// Verify initial state: p2 (client:view) is in admin, agent, viewer
const rolesBeforePull = await roleRepo.findWithRelations({}, ['permissions']);
const rolesWithP2Before = rolesBeforePull.filter(r =>
  (r.permissions ?? []).some(p => (typeof p === 'string' ? p : p.id) === p2.id)
);
results.t07_fixC_before_pull = rolesWithP2Before.length === 3 ? 'OK' : `FAIL: expected 3, got ${rolesWithP2Before.length}`;

// Simulate removePermissionFromAll(p2.id) using pull()
const allRoles = await roleRepo.findWithRelations({}, ['permissions']);
let pullCount = 0;
for (const role of allRoles) {
  const hasIt = (role.permissions ?? []).some(p => (typeof p === 'string' ? p : p.id) === p2.id);
  if (hasIt) {
    await roleRepo.pull(role.id, 'permissions', p2.id);
    pullCount++;
  }
}
results.t08_fixC_pull_count = pullCount === 3 ? 'OK' : `FAIL: expected 3 roles modified, got ${pullCount}`;

// Verify: p2 removed from all roles
const rolesAfterPull = await roleRepo.findWithRelations({}, ['permissions']);
const rolesWithP2After = rolesAfterPull.filter(r =>
  (r.permissions ?? []).some(p => (typeof p === 'string' ? p : p.id) === p2.id)
);
results.t09_fixC_after_pull = rolesWithP2After.length === 0 ? 'OK' : `FAIL: expected 0, got ${rolesWithP2After.length}`;

// Verify: other permissions untouched (admin should still have p1, p3, p4)
const adminAfter = rolesAfterPull.find(r => r.name === 'admin');
const adminPermCount = (adminAfter?.permissions ?? []).length;
results.t10_fixC_other_perms_safe = adminPermCount === 3 ? 'OK' : `FAIL: expected 3, got ${adminPermCount}`;

// ═══════════════════════════════════════════════════════════
// FIX D: Normalize IDs — use .id, never ._id
// (replaces: p.id || p._id?.toString())
// ═══════════════════════════════════════════════════════════

const rolesPopulated = await roleRepo.findWithRelations({}, ['permissions']);
let allIdsValid = true;
for (const role of rolesPopulated) {
  for (const perm of role.permissions ?? []) {
    // Fix D pattern: typeof p === 'object' ? p.id : String(p)
    const permId = typeof perm === 'object' ? perm.id : String(perm);
    if (!permId || typeof permId !== 'string') {
      allIdsValid = false;
    }
    // Verify: ._id should NOT exist (ORM normalizes to .id)
    if (typeof perm === 'object' && '_id' in perm) {
      allIdsValid = false;
    }
  }
}
results.t11_fixD_no_underscore_id = allIdsValid ? 'OK' : 'FAIL: found _id or invalid id';

// Also test on users.roles
const usersPopulated = await userRepo.findWithRelations({}, ['roles']);
let userIdsValid = true;
for (const u of usersPopulated) {
  for (const role of u.roles ?? []) {
    const roleId = typeof role === 'object' ? role.id : String(role);
    if (!roleId || typeof roleId !== 'string') userIdsValid = false;
    if (typeof role === 'object' && '_id' in role) userIdsValid = false;
  }
}
results.t12_fixD_user_roles_normalized = userIdsValid ? 'OK' : 'FAIL: found _id or invalid id in user roles';

// ═══════════════════════════════════════════════════════════
// BONUS: addToSet (used by addPermission in SecuAccessPro)
// ═══════════════════════════════════════════════════════════

// Re-add p2 to viewer role via addToSet
await roleRepo.addToSet(viewerRole.id, 'permissions', p2.id);
const viewerAfterAdd = await roleRepo.findWithRelations({ name: 'viewer' }, ['permissions']);
const viewerPerms = viewerAfterAdd[0]?.permissions ?? [];
results.t13_addToSet_m2m = viewerPerms.length === 1 ? 'OK' : `FAIL: expected 1, got ${viewerPerms.length}`;
const addedPermId = typeof viewerPerms[0] === 'object' ? viewerPerms[0].id : viewerPerms[0];
results.t14_addToSet_correct_perm = addedPermId === p2.id ? 'OK' : 'FAIL: wrong permission added';

// ═══════════════════════════════════════════════════════════
await dialect.disconnect();
console.log(JSON.stringify(results));

// Author: Dr Hamid MADANI drmdh@msn.com
// Test: Full seeding flow (RBAC + createAdmin + seeds with lookupFields)
// Simulates what @mostajs/setup runInstall does on SecuAccessPro
//
// Usage: DIALECT=sqlite DB_URI=/tmp/test.db node tests-scripts/test-seeding-multidialect.mjs
//        DIALECT=postgres DB_URI=postgresql://... node tests-scripts/test-seeding-multidialect.mjs
//        DIALECT=oracle DB_URI=oracle://... node tests-scripts/test-seeding-multidialect.mjs
//        DIALECT=mongodb DB_URI=mongodb://... node tests-scripts/test-seeding-multidialect.mjs

import { registerSchemas, getDialect, BaseRepository, clearRegistry, disconnectDialect } from '../dist/index.js';

const DIALECT = process.env.DIALECT || 'sqlite';
const DB_URI  = process.env.DB_URI || '/tmp/test-seeding.db';

// ── Schemas (simplified SecuAccessPro) ──────────────────

const PermCatSchema = {
  name: 'SdPermCat', collection: 'sd_permission_categories',
  fields: { name: { type: 'string', required: true, unique: true }, label: { type: 'string' }, order: { type: 'number', default: 0 } },
  relations: {}, indexes: [], timestamps: true,
};

const PermSchema = {
  name: 'SdPerm', collection: 'sd_permissions',
  fields: { name: { type: 'string', required: true, unique: true }, description: { type: 'string' }, category: { type: 'string' } },
  relations: {}, indexes: [], timestamps: true,
};

const RoleSchema = {
  name: 'SdRole', collection: 'sd_roles',
  fields: { name: { type: 'string', required: true, unique: true }, description: { type: 'string' } },
  relations: { permissions: { target: 'SdPerm', type: 'many-to-many', through: 'sd_role_permissions' } },
  indexes: [], timestamps: true,
};

const UserSchema = {
  name: 'SdUser', collection: 'sd_users',
  fields: {
    email: { type: 'string', required: true, unique: true },
    password: { type: 'string', required: true },
    firstName: { type: 'string', required: true },
    lastName: { type: 'string', required: true },
    status: { type: 'string', default: 'active' },
  },
  relations: { roles: { target: 'SdRole', type: 'many-to-many', through: 'sd_user_roles' } },
  indexes: [], timestamps: true,
};

const ActivitySchema = {
  name: 'SdActivity', collection: 'sd_activities',
  fields: {
    name: { type: 'string', required: true },
    slug: { type: 'string', required: true, unique: true },
    price: { type: 'number', default: 0 },
    status: { type: 'string', default: 'active' },
  },
  relations: {}, indexes: [], timestamps: true,
};

const ClientSchema = {
  name: 'SdClient', collection: 'sd_clients',
  fields: {
    firstName: { type: 'string', required: true },
    lastName: { type: 'string', required: true },
    phone: { type: 'string' },
    email: { type: 'string' },
    clientType: { type: 'string' },
    status: { type: 'string', default: 'active' },
  },
  relations: { createdBy: { target: 'SdUser', type: 'many-to-one', required: true } },
  indexes: [], timestamps: true,
};

const PlanSchema = {
  name: 'SdPlan', collection: 'sd_plans',
  fields: {
    name: { type: 'string', required: true },
    description: { type: 'string' },
    type: { type: 'string', enum: ['temporal', 'usage', 'mixed'], required: true },
    duration: { type: 'number' },
    price: { type: 'number', required: true },
    activities: { type: 'array', arrayOf: { kind: 'embedded', fields: { activity: { type: 'string' }, sessionsCount: { type: 'number' } } } },
  },
  relations: {}, indexes: [], timestamps: true,
};

const allSchemas = [PermCatSchema, PermSchema, RoleSchema, UserSchema, ActivitySchema, ClientSchema, PlanSchema];

// ── Setup ────────────────────────────────────────────────

await disconnectDialect();
clearRegistry();
registerSchemas(allSchemas);

const dialect = await getDialect({ dialect: DIALECT, uri: DB_URI, schemaStrategy: 'create' });
await dialect.initSchema(allSchemas);

const catRepo = new BaseRepository(PermCatSchema, dialect);
const permRepo = new BaseRepository(PermSchema, dialect);
const roleRepo = new BaseRepository(RoleSchema, dialect);
const userRepo = new BaseRepository(UserSchema, dialect);
const actRepo = new BaseRepository(ActivitySchema, dialect);
const clientRepo = new BaseRepository(ClientSchema, dialect);
const planRepo = new BaseRepository(PlanSchema, dialect);

const results = {};

// ═══════════════════════════════════════════════════════════
// STEP 1: Seed RBAC (categories, permissions, roles with m2m)
// ═══════════════════════════════════════════════════════════

const cat = await catRepo.create({ name: 'admin', label: 'Administration', order: 1 });
results.t01_category = cat.id ? 'OK' : 'FAIL';

const p1 = await permRepo.create({ name: 'admin:access', description: 'Admin access', category: 'admin' });
const p2 = await permRepo.create({ name: 'client:view', description: 'View clients', category: 'admin' });
results.t02_permissions = p1.id && p2.id ? 'OK' : 'FAIL';

const adminRole = await roleRepo.create({ name: 'admin', description: 'Admin', permissions: [p1.id, p2.id] });
const agentRole = await roleRepo.create({ name: 'agent', description: 'Agent', permissions: [p2.id] });
results.t03_roles = adminRole.id && agentRole.id ? 'OK' : 'FAIL';

// Verify role-permission junction
const adminWithPerms = await roleRepo.findWithRelations({ name: 'admin' }, ['permissions']);
const adminPermCount = (adminWithPerms[0]?.permissions ?? []).length;
results.t04_role_perms_junction = adminPermCount === 2 ? 'OK' : `FAIL: expected 2 perms, got ${adminPermCount}`;

// ═══════════════════════════════════════════════════════════
// STEP 2: Create admin user (bcrypt hash + role assignment)
// ═══════════════════════════════════════════════════════════

const bcryptModule = await import('bcryptjs');
const bcrypt = bcryptModule.default || bcryptModule;
const hashedPw = await bcrypt.hash('Admin@123456', 12);

const adminUser = await userRepo.create({
  email: 'admin@test.dz', password: hashedPw,
  firstName: 'Admin', lastName: 'Test', status: 'active',
  roles: [adminRole.id],
});
results.t05_admin_user = adminUser.id ? 'OK' : 'FAIL';

// Verify user-role junction
const usersWithRoles = await userRepo.findWithRelations({ email: 'admin@test.dz' }, ['roles']);
const userRoleCount = (usersWithRoles[0]?.roles ?? []).length;
results.t06_user_role_junction = userRoleCount === 1 ? 'OK' : `FAIL: expected 1 role, got ${userRoleCount}`;

// ═══════════════════════════════════════════════════════════
// STEP 3: Seed activities
// ═══════════════════════════════════════════════════════════

await actRepo.create({ name: 'Piscine', slug: 'piscine', price: 800, status: 'active' });
await actRepo.create({ name: 'Tennis', slug: 'tennis', price: 1000, status: 'active' });
await actRepo.create({ name: 'Football', slug: 'football', price: 500, status: 'active' });
results.t07_activities = (await actRepo.count()) === 3 ? 'OK' : 'FAIL';

// ═══════════════════════════════════════════════════════════
// STEP 4: Seed demo users with roleField + hashField
// ═══════════════════════════════════════════════════════════

const agentPw = await bcrypt.hash('Agent@123456', 12);
const agentUser = await userRepo.create({
  email: 'agent@test.dz', password: agentPw,
  firstName: 'Agent', lastName: 'Test', status: 'active',
  roles: [agentRole.id],
});
results.t08_demo_user = agentUser.id ? 'OK' : 'FAIL';
results.t09_total_users = (await userRepo.count()) === 2 ? 'OK' : `FAIL: got ${await userRepo.count()}`;

// ═══════════════════════════════════════════════════════════
// STEP 5: Seed clients with lookupField (createdBy → admin user)
// ═══════════════════════════════════════════════════════════

// Simulate lookupFields resolution: find admin user by email
const lookupUser = await userRepo.findOne({ email: 'admin@test.dz' });
const createdById = lookupUser?.id;
results.t10_lookup_resolve = createdById ? 'OK' : 'FAIL: admin not found for lookup';

await clientRepo.create({ firstName: 'Samir', lastName: 'Boudjema', phone: '0550100001', clientType: 'abonne', status: 'active', createdBy: createdById });
await clientRepo.create({ firstName: 'Amina', lastName: 'Khelifi', phone: '0550100002', clientType: 'abonne', status: 'active', createdBy: createdById });
await clientRepo.create({ firstName: 'Omar', lastName: 'Djebbar', phone: '0550100003', clientType: 'visiteur', status: 'active', createdBy: createdById });
results.t11_clients = (await clientRepo.count()) === 3 ? 'OK' : `FAIL: got ${await clientRepo.count()}`;

// ═══════════════════════════════════════════════════════════
// STEP 6: Seed plans with embedded activity array
// ═══════════════════════════════════════════════════════════

const piscine = await actRepo.findOne({ slug: 'piscine' });
const tennis = await actRepo.findOne({ slug: 'tennis' });
const football = await actRepo.findOne({ slug: 'football' });

await planRepo.create({
  name: 'Famille Mensuel', description: '30 jours', type: 'temporal', duration: 30, price: 5000,
  activities: [{ activity: piscine.id, sessionsCount: null }],
});
await planRepo.create({
  name: 'Pack Sport', description: '15 seances', type: 'usage', duration: null, price: 12000,
  activities: [{ activity: tennis.id, sessionsCount: 15 }, { activity: football.id, sessionsCount: 15 }],
});
results.t12_plans = (await planRepo.count()) === 2 ? 'OK' : `FAIL: got ${await planRepo.count()}`;

// Verify embedded activities are stored correctly
const famillePlan = await planRepo.findOne({ name: 'Famille Mensuel' });
const planActivities = famillePlan?.activities ?? [];
results.t13_plan_activities = planActivities.length === 1 ? 'OK' : `FAIL: expected 1, got ${planActivities.length}`;
const storedActId = typeof planActivities[0]?.activity === 'object' ? planActivities[0].activity.id : planActivities[0]?.activity;
results.t14_plan_activity_id = storedActId === piscine.id ? 'OK' : `FAIL: expected ${piscine.id}, got ${storedActId}`;

// ═══════════════════════════════════════════════════════════
await dialect.disconnect();
console.log(JSON.stringify(results));

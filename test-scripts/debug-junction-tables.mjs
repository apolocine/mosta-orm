// Author: Dr Hamid MADANI drmdh@msn.com
// Debug: liste les tables creees par l'ORM pour verifier les noms de junction
// Usage: DIALECT=sqlite DB_URI=/tmp/test.db node tests-scripts/debug-junction-tables.mjs
import { registerSchemas, clearRegistry, createIsolatedDialect } from '../dist/index.js';

const DIALECT = process.env.DIALECT || 'sqlite';
const DB_URI  = process.env.DB_URI  || '/tmp/test-debug-junction.db';
const PREFIX  = `m2d_${DIALECT.slice(0, 3)}`;

const RoleSchema = {
  name: `${PREFIX}Role`, collection: `${PREFIX}_roles`,
  fields: { name: { type: 'string' } },
  relations: {}, indexes: [], timestamps: false,
};

const UserSchema = {
  name: `${PREFIX}User`, collection: `${PREFIX}_users`,
  fields: { name: { type: 'string' } },
  relations: {
    roles: {
      target: `${PREFIX}Role`,
      type: 'many-to-many',
      through: `${PREFIX}_user_roles`,
    },
  },
  indexes: [], timestamps: false,
};

clearRegistry();
registerSchemas([UserSchema, RoleSchema]);

const dialect = await createIsolatedDialect(
  { dialect: DIALECT, uri: DB_URI, schemaStrategy: 'create' },
  [UserSchema, RoleSchema]
);

// Lister les tables
if (DIALECT === 'sqlite') {
  const db = dialect.db;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('TABLES:', JSON.stringify(tables, null, 2));

  // Schema de chaque table
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info('${t.name}')`).all();
    console.log(`\n${t.name}:`, cols.map(c => `${c.name} (${c.type})`).join(', '));
  }
} else if (DIALECT === 'postgres') {
  const rows = await dialect.executeQuery(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'", []
  );
  console.log('TABLES:', JSON.stringify(rows, null, 2));
} else if (DIALECT === 'mongodb') {
  console.log('MongoDB: pas de junction table (M2M = array dans le document)');
}

// Test: creer un user avec roles et verifier la junction
const r1 = await dialect.create(RoleSchema, { name: 'Admin' });
const r2 = await dialect.create(RoleSchema, { name: 'Editor' });
console.log('\nRole 1:', JSON.stringify(r1));
console.log('Role 2:', JSON.stringify(r2));

const user = await dialect.create(UserSchema, {
  name: 'Alice',
  roles: [r1.id, r2.id],
});
console.log('\nUser:', JSON.stringify(user));

// Verifier junction
if (DIALECT !== 'mongodb') {
  try {
    const jRows = await dialect.executeQuery(
      `SELECT * FROM "${PREFIX}_user_roles"`, []
    );
    console.log('\nJunction rows:', JSON.stringify(jRows, null, 2));
  } catch (err) {
    console.log('\nJunction query error:', err.message);
    // Essayer sans quotes
    try {
      const jRows = await dialect.executeQuery(
        `SELECT * FROM ${PREFIX}_user_roles`, []
      );
      console.log('Junction rows (no quotes):', JSON.stringify(jRows, null, 2));
    } catch (err2) {
      console.log('Junction query error (no quotes):', err2.message);
    }
  }
}

await dialect.disconnect();

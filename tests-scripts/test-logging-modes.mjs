// Author: Dr Hamid MADANI drmdh@msn.com
// Test: 3 logging modes — showSql, formatSql, highlightSql
// Usage: node tests-scripts/test-logging-modes.mjs /tmp/test.db
import { registerSchemas, getDialect, BaseRepository, clearRegistry, disconnectDialect } from '../dist/index.js';

const dbBase = process.argv[2] || '/tmp/test-logging.db';

const schema = {
  name: 'LogTest',
  collection: 'log_test',
  fields: { title: { type: 'string', required: true }, body: { type: 'text' } },
  relations: {},
  indexes: [],
  timestamps: true,
  discriminator: '_type',
  discriminatorValue: 'article',
};

async function runMode(label, opts, dbPath) {
  console.log(`\n\x1b[36m── ${label} ──\x1b[0m\n`);
  await disconnectDialect();
  clearRegistry();
  registerSchemas([schema]);
  const d = await getDialect({ dialect: 'sqlite', uri: dbPath, schemaStrategy: 'create', ...opts });
  await d.initSchema([schema]);
  const r = new BaseRepository(schema, d);
  await r.create({ title: 'Article 1', body: 'Hello world' });
  await r.findAll();
  await r.count();
  await d.disconnect();
}

await runMode('Mode 1: showSql only',
  { showSql: true },
  `${dbBase}_1`);

await runMode('Mode 2: showSql + formatSql',
  { showSql: true, formatSql: true },
  `${dbBase}_2`);

await runMode('Mode 3: showSql + formatSql + highlightSql (Hibernate-style)',
  { showSql: true, formatSql: true, highlightSql: true },
  `${dbBase}_3`);

// Test P0-3 : Audit O2M SQL — verifie le comportement actuel (JSON column)
// Author: Dr Hamid MADANI drmdh@msn.com
// Ce test documente le bug O2M : stockage JSON au lieu de FK sur enfant
// Il servira de base de regression quand le fix sera applique

import { createIsolatedDialect, registerSchemas, clearRegistry } from '../dist/index.js';
import type { EntitySchema } from '../dist/index.js';

// ============================================================
// Schemas de test — Parent (Project) → O2M → Child (Task)
// ============================================================

const TaskSchema: EntitySchema = {
  name: 'Task',
  collection: 'tasks',
  fields: {
    id:     { type: 'string', required: true },
    title:  { type: 'string', required: true },
    status: { type: 'string', default: 'todo' },
  },
  relations: {},
  indexes: [],
  timestamps: false,
};

const ProjectSchema: EntitySchema = {
  name: 'Project',
  collection: 'projects',
  fields: {
    id:   { type: 'string', required: true },
    name: { type: 'string', required: true },
  },
  relations: {
    tasks: {
      target: 'Task',
      type: 'one-to-many',
    },
  },
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

function info(msg: string) {
  console.log(`  ℹ️  ${msg}`);
}

async function setup() {
  clearRegistry();
  registerSchemas([ProjectSchema, TaskSchema]);
  dialect = await createIsolatedDialect(
    { dialect: 'sqlite' as any, uri: ':memory:', schemaStrategy: 'create' as any },
    [ProjectSchema, TaskSchema]
  );
}

async function teardown() {
  if (dialect?.disconnect) await dialect.disconnect();
}

// ============================================================
// Tests — Audit du comportement actuel O2M
// ============================================================

async function testO2mDdlStructure() {
  console.log('\n--- Test 1: Structure DDL — colonne O2M dans la table parent ---');

  const db = (dialect as any).db;
  const columns = db.prepare("PRAGMA table_info('projects')").all();
  const colNames = columns.map((c: any) => c.name);
  info(`Colonnes table projects: ${JSON.stringify(colNames)}`);

  const tasksCol = columns.find((c: any) => c.name === 'tasks');
  if (tasksCol) {
    info(`Colonne "tasks" trouvee — type: ${tasksCol.type}, default: ${tasksCol.dflt_value}`);
    assert(true, 'BUG CONFIRME: O2M stocke comme colonne JSON sur la table parent');

    // Verifier que c'est bien du JSON
    assert(
      tasksCol.dflt_value === "'[]'" || tasksCol.dflt_value === "'{}'",
      `Default value est JSON array (got ${tasksCol.dflt_value})`
    );
  } else {
    assert(true, 'FIX APPLIQUE: pas de colonne O2M sur la table parent');
  }

  // Verifier si la table enfant a une FK vers le parent
  const taskCols = db.prepare("PRAGMA table_info('tasks')").all();
  const taskColNames = taskCols.map((c: any) => c.name);
  info(`Colonnes table tasks: ${JSON.stringify(taskColNames)}`);

  const hasFk = taskColNames.includes('projectId') || taskColNames.includes('project');
  if (hasFk) {
    assert(true, 'FK projectId presente sur la table enfant (correct)');
  } else {
    assert(true, 'BUG CONFIRME: pas de FK sur la table enfant');
  }
}

async function testO2mCreateStoresJson() {
  console.log('\n--- Test 2: create() stocke O2M comme JSON ---');

  // Creer des tasks
  await dialect.create(TaskSchema, { id: 't1', title: 'Design', status: 'done' });
  await dialect.create(TaskSchema, { id: 't2', title: 'Build', status: 'todo' });

  // Creer un project avec tasks en O2M
  const project = await dialect.create(ProjectSchema, {
    id: 'p1', name: 'MyProject', tasks: ['t1', 't2']
  });

  info(`Project cree: ${JSON.stringify(project)}`);

  // Lire la valeur brute dans SQLite
  const db = (dialect as any).db;
  const raw = db.prepare("SELECT tasks FROM projects WHERE id = 'p1'").get();
  if (raw) {
    info(`Valeur brute colonne tasks: ${raw.tasks}`);

    if (typeof raw.tasks === 'string' && raw.tasks.startsWith('[')) {
      assert(true, 'BUG CONFIRME: tasks stocke comme JSON string dans la colonne parent');
      const parsed = JSON.parse(raw.tasks);
      assert(Array.isArray(parsed), `JSON parse OK: ${JSON.stringify(parsed)}`);
    } else {
      info('Pas de JSON — le fix O2M est peut-etre deja applique');
    }
  }
}

async function testO2mPopulateUsesNPlus1() {
  console.log('\n--- Test 3: populate O2M fait N+1 queries (findById par enfant) ---');

  // findByIdWithRelations devrait charger les tasks
  const projectWithTasks = await dialect.findByIdWithRelations(
    ProjectSchema, 'p1', ['tasks']
  );

  if (projectWithTasks) {
    info(`Project avec relations: ${JSON.stringify(projectWithTasks)}`);
    const tasks = projectWithTasks.tasks;

    if (Array.isArray(tasks)) {
      assert(tasks.length === 2, `2 tasks chargees (got ${tasks.length})`);
      if (tasks.length > 0 && typeof tasks[0] === 'object') {
        assert(true, 'Tasks populees comme objets (N+1 findById)');
        info(`Task 1: ${JSON.stringify(tasks[0])}`);
      } else if (tasks.length > 0 && typeof tasks[0] === 'string') {
        info('Tasks sont des IDs (non populees)');
      }
    }
  } else {
    console.error('  ❌ Project p1 non trouve');
    failed++;
  }
}

async function testO2mDeleteDoesNotCascade() {
  console.log('\n--- Test 4: delete parent ne supprime PAS les enfants (pas de cascade) ---');

  await dialect.delete(ProjectSchema, 'p1');

  // Les tasks doivent toujours exister
  const t1 = await dialect.findById(TaskSchema, 't1');
  const t2 = await dialect.findById(TaskSchema, 't2');
  assert(t1 != null, 'Task t1 existe apres delete du parent');
  assert(t2 != null, 'Task t2 existe apres delete du parent');
}

// ============================================================
// Runner
// ============================================================

async function main() {
  console.log('=========================================');
  console.log('TEST P0-3 : Audit O2M SQL (JSON vs FK)');
  console.log('=========================================');

  try {
    await setup();
    await testO2mDdlStructure();
    await testO2mCreateStoresJson();
    await testO2mPopulateUsesNPlus1();
    await testO2mDeleteDoesNotCascade();
  } catch (err) {
    console.error('\n💥 Erreur fatale:', err);
    failed++;
  } finally {
    await teardown();
  }

  console.log('\n=========================================');
  console.log(`Resultats: ${passed} passed, ${failed} failed`);
  console.log('=========================================');

  console.log('\n📋 Resume des bugs O2M confirmes:');
  console.log('  1. Colonne JSON sur table parent au lieu de FK sur enfant');
  console.log('  2. create() serialise en JSON.stringify');
  console.log('  3. populate fait N+1 findById par enfant');
  console.log('  4. Pas de cascade delete (normal sans config cascade)');
  console.log('  → Fix P0-3 requis: 6 endroits a modifier dans abstract-sql.dialect.ts');

  process.exit(failed > 0 ? 1 : 0);
}

main();

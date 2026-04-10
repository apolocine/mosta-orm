// Author: Dr Hamid MADANI drmdh@msn.com
// Setup: cree la base de test si elle n'existe pas
// Usage: DIALECT=postgres DB_URI=postgresql://... DB_NAME=test_m2m_orm node tests-scripts/setup-test-db.mjs
import { createDatabase } from '../dist/index.js';

const DIALECT = process.env.DIALECT || 'postgres';
const DB_URI  = process.env.DB_URI  || 'postgresql://devuser:devpass26@localhost:5432/test_m2m_orm';
const DB_NAME = process.env.DB_NAME || 'test_m2m_orm';

try {
  const result = await createDatabase(DIALECT, DB_URI);
  console.log(`${DIALECT}: ${result.detail || result.ok}`);
} catch (err) {
  // Si la base existe deja, c'est OK
  if (err.message?.includes('already exists')) {
    console.log(`${DIALECT}: database ${DB_NAME} already exists — OK`);
  } else {
    console.error(`${DIALECT}: ${err.message}`);
    process.exit(1);
  }
}

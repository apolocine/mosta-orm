// Configuration Vitest — suite de tests automatisés @mostajs/orm
// Tests rejouables en CI sur les dialectes IN-PROCESS (sqlite/sqljs/pglite/duckdb),
// sans aucune infrastructure (ni Docker, ni serveur distant).
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Les dialectes in-process gardent un état fichier/mémoire : on isole par fichier.
    pool: 'forks',
    reporters: 'default',
  },
});

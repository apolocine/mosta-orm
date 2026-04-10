// Author: Dr Hamid MADANI drmdh@msn.com
// Configuration des SGBD pour les tests de validation des dialects ORM

export interface DbTestConfig {
  dialect: string
  uri: string
  label: string
  host?: string
  port?: number
  dbName: string
  user?: string
  password?: string
}

// Tous les SGBD via SSH tunnel vers amia.fr (sauf SQLite = local)
export const SGBD_CONFIGS: Record<string, DbTestConfig> = {
  sqlite: {
    dialect: 'sqlite',
    uri: './data/test-orm.db',
    label: 'SQLite',
    dbName: 'test-orm',
  },
  mongodb: {
    dialect: 'mongodb',
    uri: 'mongodb://devuser:devpass26@localhost:27017/testormdb',
    label: 'MongoDB',
    host: 'localhost',
    port: 27017,
    dbName: 'testormdb',
    user: 'devuser',
    password: 'devpass26',
  },
  mariadb: {
    dialect: 'mariadb',
    uri: 'mariadb://devuser:devpass26@localhost:3307/testormdb',
    label: 'MariaDB',
    host: 'localhost',
    port: 3307,
    dbName: 'testormdb',
    user: 'devuser',
    password: 'devpass26',
  },
  mysql: {
    dialect: 'mysql',
    uri: 'mysql://devuser:devpass26@localhost:3306/testormdb',
    label: 'MySQL',
    host: 'localhost',
    port: 3306,
    dbName: 'testormdb',
    user: 'devuser',
    password: 'devpass26',
  },
  postgres: {
    dialect: 'postgres',
    uri: 'postgresql://devuser:devpass26@localhost:5432/testormdb',
    label: 'PostgreSQL',
    host: 'localhost',
    port: 5432,
    dbName: 'testormdb',
    user: 'devuser',
    password: 'devpass26',
  },
  oracle: {
    dialect: 'oracle',
    uri: 'oracle://devuser:devpass26@localhost:1521/XEPDB1',
    label: 'Oracle XE 21c',
    host: 'localhost',
    port: 1521,
    dbName: 'XEPDB1',
    user: 'devuser',
    password: 'devpass26',
  },
}

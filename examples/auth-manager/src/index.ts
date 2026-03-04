/**
 * Serveur Express — Auth Manager
 * Exemple MostaORM : authentification securisee (JWT, bcrypt, sessions)
 *
 * Port : 3003 (defaut)
 * Dialect : SQLite par defaut
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { createConnection } from 'mostaorm';
import { UserSchema } from './entities/user.schema.js';
import { SessionSchema } from './entities/session.schema.js';
import { AuditLogSchema } from './entities/audit-log.schema.js';
import { UserRepository } from './repositories/user.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { AuditLogRepository } from './repositories/audit-log.repository.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';

const PORT = Number(process.env.PORT) || 3003;

async function main() {
  /* ── Connexion MostaORM ── */
  const dialect = await createConnection(
    {
      dialect: (process.env.DB_DIALECT as any) || 'sqlite',
      uri: process.env.SGBD_URI || './data/auth-manager.db',
      schemaStrategy: 'update',
    },
    [UserSchema, SessionSchema, AuditLogSchema],
  );

  /* ── Repositories ── */
  const users = new UserRepository(dialect);
  const sessions = new SessionRepository(dialect);
  const auditLogs = new AuditLogRepository(dialect);

  /* ── Seed admin si base vide ── */
  const existing = await users.findAll();
  if (existing.length === 0) {
    console.log('Base vide — creation du compte admin...');
    await users.register({
      email: 'admin@example.com',
      username: 'admin',
      password: 'Admin123!',
      firstName: 'Admin',
      lastName: 'System',
      role: 'admin',
    });
    // Creer aussi un utilisateur normal
    await users.register({
      email: 'user@example.com',
      username: 'user',
      password: 'User1234!',
      firstName: 'Karim',
      lastName: 'Benali',
    });
    console.log('Seed: admin (admin/Admin123!) + user (user/User1234!)');
  }

  /* ── Express ── */
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static('public'));

  app.use('/api/auth', authRoutes({ users, sessions, auditLogs }));
  app.use('/api/admin', adminRoutes({ users, sessions, auditLogs }));

  app.listen(PORT, () => {
    console.log(`Auth Manager — http://localhost:${PORT}`);
  });
}

main().catch(console.error);

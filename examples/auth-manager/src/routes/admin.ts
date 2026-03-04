/**
 * Routes d'administration (gestion utilisateurs + audit)
 * Protegees par requireAuth + requireAdmin
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import type { UserRepository } from '../repositories/user.repository.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

interface Repos {
  users: UserRepository;
  sessions: SessionRepository;
  auditLogs: AuditLogRepository;
}

export function adminRoutes(repos: Repos) {
  const r = Router();
  r.use(requireAuth, requireAdmin);

  /** GET /users — liste de tous les utilisateurs */
  r.get('/users', async (_req, res) => {
    try {
      const users = await repos.users.findAll({}, { sort: { createdAt: -1 } });
      res.json(users.map(({ passwordHash, ...u }) => u));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /users/:id/role — changer le role */
  r.patch('/users/:id/role', async (req, res) => {
    try {
      const { role } = req.body;
      if (!['user', 'admin', 'moderator'].includes(role)) {
        return res.status(400).json({ error: 'Role invalide' });
      }
      const user = await repos.users.update(req.params.id, { role } as any);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

      await repos.auditLogs.log({
        userId: req.user!.sub, action: 'role_change',
        details: `${req.params.id} → ${role}`,
      });

      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /users/:id/ban — bannir */
  r.patch('/users/:id/ban', async (req, res) => {
    try {
      const user = await repos.users.ban(req.params.id);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      await repos.sessions.revokeAllForUser(req.params.id);
      res.json({ message: 'Utilisateur banni' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /users/:id/unban — debannir */
  r.patch('/users/:id/unban', async (req, res) => {
    try {
      const user = await repos.users.unban(req.params.id);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      await repos.auditLogs.log({
        userId: req.user!.sub, action: 'account_unlocked',
        details: req.params.id,
      });
      res.json({ message: 'Utilisateur debanni' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /audit — journal d'audit */
  r.get('/audit', async (_req, res) => {
    try {
      res.json(await repos.auditLogs.findRecent(100));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /audit/failures — echecs recents */
  r.get('/audit/failures', async (_req, res) => {
    try {
      res.json(await repos.auditLogs.findRecentFailures(50));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}

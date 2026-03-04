/**
 * Routes d'authentification (register, login, logout, refresh, me, password)
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import type { UserRepository } from '../repositories/user.repository.js';
import type { SessionRepository } from '../repositories/session.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import { generateAccessToken, requireAuth } from '../middleware/auth.js';
import type { JwtPayload } from '../middleware/auth.js';

interface Repos {
  users: UserRepository;
  sessions: SessionRepository;
  auditLogs: AuditLogRepository;
}

export function authRoutes(repos: Repos) {
  const r = Router();

  /** POST /register — inscription */
  r.post('/register', async (req, res) => {
    try {
      const { email, username, password, firstName, lastName } = req.body;
      if (!email || !username || !password) {
        return res.status(400).json({ error: 'email, username et password requis' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caracteres' });
      }

      // Verifier unicite
      const existingEmail = await repos.users.findByEmail(email);
      if (existingEmail) return res.status(409).json({ error: 'Email deja utilise' });
      const existingUser = await repos.users.findByUsername(username);
      if (existingUser) return res.status(409).json({ error: 'Username deja utilise' });

      const user = await repos.users.register({ email, username, password, firstName, lastName });

      await repos.auditLogs.log({
        userId: user.id, action: 'register',
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });

      const { passwordHash, ...safeUser } = user;
      res.status(201).json({ user: safeUser });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /login — connexion */
  r.post('/login', async (req, res) => {
    try {
      const { login, password } = req.body;
      if (!login || !password) {
        return res.status(400).json({ error: 'login et password requis' });
      }

      // Chercher par email ou username
      const user = login.includes('@')
        ? await repos.users.findByEmail(login)
        : await repos.users.findByUsername(login);

      if (!user) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }

      // Verifier le verrouillage
      if (repos.users.isLocked(user)) {
        await repos.auditLogs.log({
          userId: user.id, action: 'login_failed', success: false,
          ipAddress: req.ip, userAgent: req.headers['user-agent'],
          details: 'Compte verrouille',
        });
        return res.status(423).json({ error: 'Compte verrouille. Reessayez dans 15 minutes.' });
      }

      // Verifier le statut
      if (user.status === 'banned') {
        return res.status(403).json({ error: 'Compte banni' });
      }
      if (user.status === 'inactive') {
        return res.status(403).json({ error: 'Compte desactive' });
      }

      // Verifier le mot de passe
      const valid = await repos.users.verifyPassword(user, password);
      if (!valid) {
        await repos.users.recordFailedLogin(user.id);
        await repos.auditLogs.log({
          userId: user.id, action: 'login_failed', success: false,
          ipAddress: req.ip, userAgent: req.headers['user-agent'],
          details: `Tentative ${(user.failedAttempts || 0) + 1}/5`,
        });
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }

      // Login reussi
      await repos.users.recordLogin(user.id);
      const session = await repos.sessions.createSession(user.id, req.ip, req.headers['user-agent']);

      const payload: JwtPayload = {
        sub: user.id, email: user.email,
        username: user.username, role: user.role,
      };
      const accessToken = generateAccessToken(payload);

      await repos.auditLogs.log({
        userId: user.id, action: 'login',
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });

      const { passwordHash, ...safeUser } = user;
      res.json({
        user: safeUser,
        accessToken,
        refreshToken: session.refreshToken,
        expiresIn: '15m',
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /refresh — renouveler l'access token */
  r.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: 'refreshToken requis' });

      const session = await repos.sessions.isValid(refreshToken);
      if (!session) return res.status(401).json({ error: 'Refresh token invalide ou expire' });

      const userId = typeof session.user === 'object' ? session.user.id : session.user;
      const user = await repos.users.findById(userId);
      if (!user || user.status !== 'active') {
        return res.status(401).json({ error: 'Utilisateur inactif' });
      }

      const payload: JwtPayload = {
        sub: user.id, email: user.email,
        username: user.username, role: user.role,
      };
      const accessToken = generateAccessToken(payload);

      await repos.auditLogs.log({
        userId: user.id, action: 'token_refresh',
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });

      res.json({ accessToken, expiresIn: '15m' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST /logout — deconnexion */
  r.post('/logout', requireAuth, async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        const session = await repos.sessions.findByRefreshToken(refreshToken);
        if (session) await repos.sessions.revoke(session.id);
      }
      await repos.auditLogs.log({
        userId: req.user!.sub, action: 'logout',
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      res.json({ message: 'Deconnecte' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /me — profil de l'utilisateur connecte */
  r.get('/me', requireAuth, async (req, res) => {
    try {
      const user = await repos.users.findById(req.user!.sub);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PUT /me/password — changer le mot de passe */
  r.put('/me/password', requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword et newPassword requis' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caracteres' });
      }

      const user = await repos.users.findById(req.user!.sub);
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

      const valid = await repos.users.verifyPassword(user, currentPassword);
      if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

      await repos.users.changePassword(user.id, newPassword);
      // Revoquer toutes les sessions sauf celle en cours
      await repos.sessions.revokeAllForUser(user.id);

      await repos.auditLogs.log({
        userId: user.id, action: 'password_change',
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });

      res.json({ message: 'Mot de passe modifie. Toutes les sessions ont ete revoquees.' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /sessions — sessions actives de l'utilisateur */
  r.get('/sessions', requireAuth, async (req, res) => {
    try {
      const sessions = await repos.sessions.findActiveByUser(req.user!.sub);
      res.json(sessions.map(s => ({
        id: s.id, ipAddress: s.ipAddress, userAgent: s.userAgent,
        createdAt: s.createdAt, expiresAt: s.expiresAt,
      })));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** DELETE /sessions — revoquer toutes les autres sessions */
  r.delete('/sessions', requireAuth, async (req, res) => {
    try {
      const count = await repos.sessions.revokeAllForUser(req.user!.sub);
      res.json({ revoked: count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}

/**
 * Middleware d'authentification JWT
 *
 * Verifie le token Bearer dans le header Authorization.
 * Ajoute req.user (id, email, role) si le token est valide.
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mostaorm-auth-example-secret-key-change-in-prod';
const JWT_EXPIRES_IN = '15m';

export interface JwtPayload {
  sub: string;   // user id
  email: string;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Generer un access token JWT */
export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** Verifier et decoder un access token */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Middleware : require authentication */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }
  req.user = payload;
  next();
}

/** Middleware : require admin role */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acces refuse — role admin requis' });
  }
  next();
}

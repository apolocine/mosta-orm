/**
 * Repository de l'entite Session
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { SessionSchema } from '../entities/session.schema.js';
import crypto from 'crypto';

export interface SessionDTO {
  id: string;
  refreshToken: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  isRevoked: boolean;
  user: any;
  createdAt?: string;
  updatedAt?: string;
}

const REFRESH_TOKEN_DAYS = 7;

export class SessionRepository extends BaseRepository<SessionDTO> {
  constructor(dialect: IDialect) {
    super(SessionSchema, dialect);
  }

  /** Creer une nouvelle session avec refresh token */
  async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<SessionDTO> {
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return this.create({
      refreshToken,
      expiresAt,
      ipAddress,
      userAgent,
      isRevoked: false,
      user: userId,
    } as Partial<SessionDTO>);
  }

  /** Trouver une session par refresh token */
  async findByRefreshToken(token: string): Promise<SessionDTO | null> {
    return this.findOne({ refreshToken: token, isRevoked: false });
  }

  /** Revoquer une session */
  async revoke(id: string) {
    return this.update(id, { isRevoked: true } as Partial<SessionDTO>);
  }

  /** Revoquer toutes les sessions d'un utilisateur */
  async revokeAllForUser(userId: string): Promise<number> {
    return this.updateMany({ user: userId, isRevoked: false }, { isRevoked: true } as Partial<SessionDTO>);
  }

  /** Verifier si un refresh token est valide */
  async isValid(token: string): Promise<SessionDTO | null> {
    const session = await this.findByRefreshToken(token);
    if (!session) return null;
    if (session.isRevoked) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) return null;
    return session;
  }

  /** Lister les sessions actives d'un utilisateur */
  async findActiveByUser(userId: string): Promise<SessionDTO[]> {
    return this.findAll({ user: userId, isRevoked: false }, { sort: { createdAt: -1 } });
  }

  /** Nettoyer les sessions expirees */
  async cleanExpired(): Promise<number> {
    const all = await this.findAll({ isRevoked: false });
    let count = 0;
    for (const s of all) {
      if (new Date(s.expiresAt).getTime() < Date.now()) {
        await this.revoke(s.id);
        count++;
      }
    }
    return count;
  }
}

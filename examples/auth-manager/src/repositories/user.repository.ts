/**
 * Repository de l'entite User
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { UserSchema } from '../entities/user.schema.js';
import bcrypt from 'bcryptjs';

export interface UserDTO {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status: string;
  lastLoginAt?: string;
  loginCount: number;
  failedAttempts: number;
  lockedUntil?: string;
  avatar?: string;
  createdAt?: string;
  updatedAt?: string;
}

const SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export class UserRepository extends BaseRepository<UserDTO> {
  constructor(dialect: IDialect) {
    super(UserSchema, dialect);
  }

  /** Creer un utilisateur avec hachage du mot de passe */
  async register(data: {
    email: string; username: string; password: string;
    firstName?: string; lastName?: string; role?: string;
  }): Promise<UserDTO> {
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    return this.create({
      email: data.email.toLowerCase().trim(),
      username: data.username.trim(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role || 'user',
      status: 'active',
      loginCount: 0,
      failedAttempts: 0,
    });
  }

  /** Trouver un utilisateur par email */
  async findByEmail(email: string): Promise<UserDTO | null> {
    return this.findOne({ email: email.toLowerCase().trim() });
  }

  /** Trouver un utilisateur par username */
  async findByUsername(username: string): Promise<UserDTO | null> {
    return this.findOne({ username: username.trim() });
  }

  /** Verifier le mot de passe */
  async verifyPassword(user: UserDTO, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  /** Verifier si le compte est verrouille */
  isLocked(user: UserDTO): boolean {
    if (!user.lockedUntil) return false;
    return new Date(user.lockedUntil).getTime() > Date.now();
  }

  /** Enregistrer une connexion reussie */
  async recordLogin(id: string) {
    const user = await this.findById(id);
    if (!user) return null;
    return this.update(id, {
      lastLoginAt: new Date().toISOString(),
      loginCount: (user.loginCount || 0) + 1,
      failedAttempts: 0,
      lockedUntil: undefined,
    } as Partial<UserDTO>);
  }

  /** Enregistrer un echec de connexion */
  async recordFailedLogin(id: string) {
    const user = await this.findById(id);
    if (!user) return null;
    const attempts = (user.failedAttempts || 0) + 1;
    const updates: Partial<UserDTO> = { failedAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
    }
    return this.update(id, updates);
  }

  /** Changer le mot de passe */
  async changePassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    return this.update(id, { passwordHash, failedAttempts: 0 } as Partial<UserDTO>);
  }

  /** Bannir un utilisateur */
  async ban(id: string) {
    return this.update(id, { status: 'banned' } as Partial<UserDTO>);
  }

  /** Debannir un utilisateur */
  async unban(id: string) {
    return this.update(id, { status: 'active', failedAttempts: 0, lockedUntil: undefined } as Partial<UserDTO>);
  }
}

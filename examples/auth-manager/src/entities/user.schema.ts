/**
 * Schema de l'entite User — Utilisateurs
 *
 * Stocke les informations de connexion et le profil.
 * Le mot de passe est hashe (bcrypt) avant stockage.
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const UserSchema: EntitySchema = {
  name: 'User',
  collection: 'users',
  timestamps: true,

  fields: {
    email: { type: 'string', required: true, unique: true },
    username: { type: 'string', required: true, unique: true },
    passwordHash: { type: 'string', required: true },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    role: {
      type: 'string', default: 'user',
      enum: ['user', 'admin', 'moderator'],
    },
    status: {
      type: 'string', default: 'active',
      enum: ['active', 'inactive', 'banned', 'pending'],
    },
    lastLoginAt: { type: 'date' },
    loginCount: { type: 'number', default: 0 },
    failedAttempts: { type: 'number', default: 0 },
    lockedUntil: { type: 'date' },
    avatar: { type: 'string' },
  },

  relations: {},

  indexes: [
    { fields: { email: 'asc' }, unique: true },
    { fields: { username: 'asc' }, unique: true },
    { fields: { role: 'asc' } },
    { fields: { status: 'asc' } },
  ],
};

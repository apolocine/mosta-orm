/**
 * Schema de l'entite Session — Sessions / Tokens
 *
 * Chaque connexion cree une session avec un refresh token.
 * L'access token (JWT) est court (15min), le refresh token est long (7j).
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const SessionSchema: EntitySchema = {
  name: 'Session',
  collection: 'sessions',
  timestamps: true,

  fields: {
    refreshToken: { type: 'string', required: true },
    expiresAt: { type: 'date', required: true },
    ipAddress: { type: 'string' },
    userAgent: { type: 'string' },
    isRevoked: { type: 'boolean', default: false },
  },

  relations: {
    user: {
      target: 'User',
      type: 'many-to-one',
      required: true,
    },
  },

  indexes: [
    { fields: { refreshToken: 'asc' }, unique: true },
    { fields: { expiresAt: 'asc' } },
  ],
};

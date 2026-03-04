/**
 * Schema de l'entite AuditLog — Journal d'audit securite
 *
 * Enregistre chaque evenement d'authentification
 * (login, logout, echec, changement de mdp, etc.)
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const AuditLogSchema: EntitySchema = {
  name: 'AuditLog',
  collection: 'audit_logs',
  timestamps: true,

  fields: {
    action: {
      type: 'string', required: true,
      enum: [
        'register', 'login', 'login_failed', 'logout',
        'password_change', 'token_refresh', 'account_locked',
        'account_unlocked', 'role_change',
      ],
    },
    ipAddress: { type: 'string' },
    userAgent: { type: 'string' },
    details: { type: 'string' },
    success: { type: 'boolean', default: true },
  },

  relations: {
    user: {
      target: 'User',
      type: 'many-to-one',
      required: true,
    },
  },

  indexes: [
    { fields: { action: 'asc' } },
    { fields: { createdAt: 'desc' } },
  ],
};

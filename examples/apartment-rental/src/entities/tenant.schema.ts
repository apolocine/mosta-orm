/**
 * Schema de l'entite Tenant — Locataires
 *
 * Represente un locataire avec ses informations personnelles,
 * coordonnees et documents administratifs.
 *
 * Inspire des plateformes : Rentila (fiche locataire),
 * Ublo (profil resident), Masteos (dossier locataire).
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const TenantSchema: EntitySchema = {
  name: 'Tenant',
  collection: 'tenants',
  timestamps: true,

  fields: {
    // Identite
    firstName: { type: 'string', required: true, trim: true },
    lastName: { type: 'string', required: true, trim: true },
    dateOfBirth: { type: 'date' },

    // Coordonnees
    email: { type: 'string', unique: true, sparse: true, lowercase: true },
    phone: { type: 'string', required: true },
    phoneSecondary: { type: 'string' },

    // Situation professionnelle
    profession: { type: 'string' },
    employer: { type: 'string' },
    monthlyIncome: { type: 'number' },

    // Pieces administratives
    idType: {
      type: 'string',
      enum: ['carte-identite', 'passeport', 'permis-conduire'],
    },
    idNumber: { type: 'string' },

    // Contact d'urgence
    emergencyContact: { type: 'string' },
    emergencyPhone: { type: 'string' },

    // Notes internes
    notes: { type: 'string' },

    // Statut
    status: {
      type: 'string', default: 'active',
      enum: ['active', 'former', 'blacklisted'],
    },
  },

  relations: {},

  indexes: [
    { fields: { lastName: 'asc', firstName: 'asc' } },
    { fields: { status: 'asc' } },
  ],
};

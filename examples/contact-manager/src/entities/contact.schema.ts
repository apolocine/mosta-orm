/**
 * Schema de l'entite Contact
 *
 * Definit la structure de la table/collection "contacts" pour MostaORM.
 * Ce schema est independant du backend DB — il fonctionne avec
 * MongoDB, SQLite, PostgreSQL, MySQL, et tous les dialectes supportes.
 *
 * Equivalent Hibernate : @Entity / @Table(name = "contacts")
 *
 * Author: Dr Hamid MADANI <drmdh@msn.com>
 */
import type { EntitySchema } from 'mostaorm';

export const ContactSchema: EntitySchema = {
  // Nom de l'entite (PascalCase) — utilise par le registry
  name: 'Contact',

  // Nom de la table SQL ou collection MongoDB
  collection: 'contacts',

  // Ajoute automatiquement createdAt et updatedAt
  timestamps: true,

  // Definition des champs (equivalent @Column)
  fields: {
    // Prenom — obligatoire, espaces supprimes automatiquement
    firstName: { type: 'string', required: true, trim: true },

    // Nom de famille — obligatoire
    lastName: { type: 'string', required: true, trim: true },

    // Email — unique mais optionnel (sparse = unique sauf null)
    email: { type: 'string', unique: true, sparse: true, lowercase: true },

    // Telephone — optionnel
    phone: { type: 'string' },

    // Entreprise — optionnel
    company: { type: 'string' },

    // Notes libres — optionnel
    notes: { type: 'string' },

    // Statut : actif ou archive (soft delete)
    status: { type: 'string', default: 'active', enum: ['active', 'archived'] },
  },

  // Pas de relations pour cet exemple simple
  relations: {},

  // Index pour optimiser les requetes frequentes
  indexes: [
    // Tri alphabetique par nom, prenom
    { fields: { lastName: 'asc', firstName: 'asc' } },
    // Filtrage par statut
    { fields: { status: 'asc' } },
  ],
};

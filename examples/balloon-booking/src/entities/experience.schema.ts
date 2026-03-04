/**
 * Schema de l'entite Experience — Types de vols en montgolfiere
 *
 * Represente les differentes formules proposees :
 *   - Vol classique (rihla 3adiya)
 *   - Cafe dans le ciel (qahwa fi s-sma)
 *   - Photographie professionnelle (taswir ihtirafi)
 *   - Celebrations (khotba, 3id milad)
 *   - VIP Sky Lounge
 *
 * Pas de relations sortantes — c'est une entite de reference.
 * Les reservations pointent VERS cette entite.
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const ExperienceSchema: EntitySchema = {
  name: 'Experience',
  collection: 'experiences',
  timestamps: true,

  fields: {
    // Nom de l'experience (ex: "Vol Classique", "VIP Sky Lounge")
    name: { type: 'string', required: true, trim: true },

    // Slug URL-friendly (ex: "vol-classique", "vip-sky-lounge")
    slug: { type: 'string', unique: true, required: true, lowercase: true },

    // Description detaillee de l'experience
    description: { type: 'string' },

    // Duree du vol en minutes (ex: 60, 90, 120)
    durationMinutes: { type: 'number', required: true },

    // Prix par personne en DA (Dinar Algerien)
    pricePerPerson: { type: 'number', required: true },

    // Nombre maximum de passagers par vol
    maxPassengers: { type: 'number', required: true },

    // Ce qui est inclus (ex: "Boisson chaude, Photos souvenir")
    includes: { type: 'string' },

    // Categorie du type d'experience
    category: {
      type: 'string',
      required: true,
      enum: ['standard', 'premium', 'celebration', 'vip'],
    },

    // URL de l'image d'illustration
    imageUrl: { type: 'string' },

    // Ordre d'affichage dans le catalogue
    sortOrder: { type: 'number', default: 0 },

    // Statut : disponible ou suspendu
    status: { type: 'string', default: 'active', enum: ['active', 'suspended'] },
  },

  relations: {},

  indexes: [
    { fields: { category: 'asc', sortOrder: 'asc' } },
    { fields: { status: 'asc' } },
  ],
};

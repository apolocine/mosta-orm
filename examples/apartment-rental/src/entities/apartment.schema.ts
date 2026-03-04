/**
 * Schema de l'entite Apartment — Biens immobiliers
 *
 * Inspire des plateformes de gestion locative (Rentila, Ublo, Masteos).
 * Represente un bien immobilier mis en location :
 *   - Informations generales (titre, type, surface)
 *   - Adresse complete (rue, ville, code postal, etage)
 *   - Caracteristiques (chambres, salles de bain, meuble, parking)
 *   - Financier (loyer, charges, depot de garantie)
 *   - Statut de disponibilite
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const ApartmentSchema: EntitySchema = {
  name: 'Apartment',
  collection: 'apartments',
  timestamps: true,

  fields: {
    // Reference interne du bien (ex: "APT-001")
    reference: { type: 'string', unique: true, required: true },

    // Titre d'annonce (ex: "F3 lumineux centre-ville Oran")
    title: { type: 'string', required: true, trim: true },

    // Type de bien
    propertyType: {
      type: 'string', required: true,
      enum: ['studio', 'f1', 'f2', 'f3', 'f4', 'f5', 'villa', 'duplex', 'local-commercial'],
    },

    // Surface habitable en m²
    surface: { type: 'number', required: true },

    // Nombre de pieces
    rooms: { type: 'number', required: true },

    // Nombre de chambres
    bedrooms: { type: 'number', required: true },

    // Nombre de salles de bain
    bathrooms: { type: 'number', default: 1 },

    // Etage (0 = RDC)
    floor: { type: 'number', default: 0 },

    // Ascenseur disponible
    hasElevator: { type: 'boolean', default: false },

    // Meuble ou vide
    furnished: { type: 'boolean', default: false },

    // Parking inclus
    hasParking: { type: 'boolean', default: false },

    // Balcon / terrasse
    hasBalcony: { type: 'boolean', default: false },

    // Adresse complete
    address: { type: 'string', required: true },
    city: { type: 'string', required: true },
    postalCode: { type: 'string' },
    wilaya: { type: 'string' },

    // Loyer mensuel en DA
    monthlyRent: { type: 'number', required: true },

    // Charges mensuelles en DA (eau, electricite, syndic...)
    monthlyCharges: { type: 'number', default: 0 },

    // Depot de garantie (caution) en DA — generalement 2-3 mois de loyer
    securityDeposit: { type: 'number', default: 0 },

    // Description detaillee
    description: { type: 'string' },

    // Statut du bien
    status: {
      type: 'string', default: 'available',
      enum: ['available', 'rented', 'maintenance', 'unavailable'],
    },
  },

  relations: {},

  indexes: [
    { fields: { city: 'asc', propertyType: 'asc' } },
    { fields: { status: 'asc' } },
    { fields: { monthlyRent: 'asc' } },
  ],
};

/**
 * Schema de l'entite Passenger — Clients / Passagers
 *
 * Represente les personnes qui reservent des vols en montgolfiere.
 * Un passager peut avoir plusieurs reservations.
 *
 * Pas de relations sortantes directes.
 * Les reservations pointent VERS cette entite.
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const PassengerSchema: EntitySchema = {
  name: 'Passenger',
  collection: 'passengers',
  timestamps: true,

  fields: {
    // Prenom du passager
    firstName: { type: 'string', required: true, trim: true },

    // Nom de famille
    lastName: { type: 'string', required: true, trim: true },

    // Email — unique, pour envoyer la confirmation et les Sky Memories
    email: { type: 'string', unique: true, required: true, lowercase: true },

    // Telephone — pour les notifications meteo et rappels
    phone: { type: 'string', required: true },

    // Date de naissance — pour les celebrations (anniversaires)
    dateOfBirth: { type: 'date' },

    // Points de fidelite cumules (systeme de points)
    loyaltyPoints: { type: 'number', default: 0 },

    // Nombre total de vols effectues
    totalFlights: { type: 'number', default: 0 },

    // Notes internes (ex: "VIP frequent", "Peur du vide — a rassurer")
    notes: { type: 'string' },

    // Statut du passager
    status: { type: 'string', default: 'active', enum: ['active', 'blocked'] },
  },

  relations: {},

  indexes: [
    { fields: { lastName: 'asc', firstName: 'asc' } },
    { fields: { email: 'asc' } },
  ],
};

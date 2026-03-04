/**
 * Schema de l'entite Reservation — Reservations de vols
 *
 * C'est l'entite centrale du systeme. Elle lie :
 *   - Un Passenger (qui reserve)
 *   - Une Experience (quel type de vol)
 *   - Une date/heure de vol
 *   - Un nombre de places
 *   - Un statut de reservation
 *
 * Relations :
 *   Reservation → Passenger  (many-to-one)
 *   Reservation → Experience (many-to-one)
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const ReservationSchema: EntitySchema = {
  name: 'Reservation',
  collection: 'reservations',
  timestamps: true,

  fields: {
    // Numero de reservation unique (ex: "RES-20260315-0042")
    reservationNumber: { type: 'string', unique: true, required: true },

    // Date et heure du vol prevu
    flightDate: { type: 'date', required: true },

    // Creneau horaire (ex: "06:00", "17:30")
    timeSlot: { type: 'string', required: true },

    // Nombre de places reservees
    seats: { type: 'number', required: true },

    // Prix total = pricePerPerson × seats
    totalPrice: { type: 'number', required: true },

    // Mode de paiement choisi
    paymentMethod: {
      type: 'string',
      required: true,
      enum: ['online', 'on-site'],
    },

    // Statut de la reservation
    status: {
      type: 'string',
      default: 'pending',
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'postponed'],
    },

    // Raison d'annulation ou de report (ex: "Meteo defavorable — vent fort")
    statusReason: { type: 'string' },

    // Message special du passager (ex: "C'est pour une demande en mariage !")
    specialRequest: { type: 'string' },

    // Points de fidelite gagnes pour ce vol
    pointsEarned: { type: 'number', default: 0 },
  },

  // Relations vers les entites liees
  relations: {
    // Le passager qui a reserve
    passenger: {
      target: 'Passenger',
      type: 'many-to-one',
      required: true,
    },
    // Le type d'experience choisi
    experience: {
      target: 'Experience',
      type: 'many-to-one',
      required: true,
    },
  },

  indexes: [
    { fields: { flightDate: 'asc', timeSlot: 'asc' } },
    { fields: { status: 'asc' } },
    { fields: { reservationNumber: 'asc' }, unique: true },
  ],
};

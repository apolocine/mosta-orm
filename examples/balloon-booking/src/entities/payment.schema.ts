/**
 * Schema de l'entite Payment — Paiements des reservations
 *
 * Chaque reservation peut avoir un ou plusieurs paiements
 * (acompte + solde, ou paiement unique).
 *
 * Relations :
 *   Payment → Reservation (many-to-one)
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const PaymentSchema: EntitySchema = {
  name: 'Payment',
  collection: 'payments',
  timestamps: true,

  fields: {
    // Montant paye en DA
    amount: { type: 'number', required: true },

    // Methode de paiement utilisee
    method: {
      type: 'string',
      required: true,
      enum: ['cash', 'card', 'transfer', 'online'],
    },

    // Statut du paiement
    status: {
      type: 'string',
      default: 'pending',
      enum: ['pending', 'completed', 'refunded', 'failed'],
    },

    // Reference de transaction (pour paiement electronique)
    transactionRef: { type: 'string' },

    // Date effective du paiement
    paidAt: { type: 'date' },

    // Notes (ex: "Acompte 50%", "Solde a l'arrivee")
    notes: { type: 'string' },
  },

  // Relation vers la reservation payee
  relations: {
    reservation: {
      target: 'Reservation',
      type: 'many-to-one',
      required: true,
    },
  },

  indexes: [
    { fields: { status: 'asc' } },
    { fields: { paidAt: 'desc' } },
  ],
};

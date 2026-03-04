/**
 * Schema de l'entite Payment — Paiements de loyer
 *
 * Enregistre chaque paiement de loyer effectue par un locataire.
 * Lie a un Lease (bail).
 *
 * Inspire de : Rentila (quittances de loyer), Ublo (suivi des paiements),
 * logique de gestion locative standard (mois concerne, statut, retard).
 *
 * Relations :
 *   Payment → Lease (many-to-one)
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const PaymentSchema: EntitySchema = {
  name: 'Payment',
  collection: 'payments',
  timestamps: true,

  fields: {
    // Mois concerne au format "YYYY-MM" (ex: "2026-03")
    period: { type: 'string', required: true },

    // Montant du loyer attendu pour ce mois
    amountDue: { type: 'number', required: true },

    // Montant effectivement paye
    amountPaid: { type: 'number', default: 0 },

    // Date du paiement effectif
    paidAt: { type: 'date' },

    // Date d'echeance (deadline)
    dueDate: { type: 'date', required: true },

    // Methode de paiement utilisee
    method: {
      type: 'string',
      enum: ['cash', 'transfer', 'check', 'ccp'],
    },

    // Numero de recu / reference
    receiptNumber: { type: 'string' },

    // Statut du paiement
    status: {
      type: 'string', default: 'pending',
      enum: ['pending', 'paid', 'partial', 'late', 'waived'],
    },

    // Nombre de jours de retard (calcule)
    daysLate: { type: 'number', default: 0 },

    // Notes (ex: "Paye en 2 fois", "Remise accordee")
    notes: { type: 'string' },
  },

  relations: {
    lease: {
      target: 'Lease',
      type: 'many-to-one',
      required: true,
    },
  },

  indexes: [
    { fields: { period: 'desc' } },
    { fields: { status: 'asc' } },
    { fields: { dueDate: 'asc' } },
  ],
};

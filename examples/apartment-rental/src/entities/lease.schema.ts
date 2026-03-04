/**
 * Schema de l'entite Lease — Baux / Contrats de location
 *
 * Le bail lie un Apartment a un Tenant pour une periode donnee.
 * C'est l'entite centrale de la gestion locative :
 *   - Dates de debut/fin
 *   - Montant du loyer contractuel
 *   - Depot de garantie
 *   - Statut du bail
 *
 * Inspire de : Rentila (contrat de bail), Ublo (gestion des baux),
 * legislation algerienne (loi 07-06 sur la location).
 *
 * Relations :
 *   Lease → Apartment (many-to-one)
 *   Lease → Tenant    (many-to-one)
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import type { EntitySchema } from 'mostaorm';

export const LeaseSchema: EntitySchema = {
  name: 'Lease',
  collection: 'leases',
  timestamps: true,

  fields: {
    // Reference du bail (ex: "BAIL-2026-001")
    leaseNumber: { type: 'string', unique: true, required: true },

    // Date de prise d'effet
    startDate: { type: 'date', required: true },

    // Date de fin (null = duree indeterminee)
    endDate: { type: 'date' },

    // Loyer mensuel contractuel en DA
    monthlyRent: { type: 'number', required: true },

    // Charges mensuelles contractuelles en DA
    monthlyCharges: { type: 'number', default: 0 },

    // Depot de garantie verse en DA
    securityDeposit: { type: 'number', default: 0 },

    // Jour du mois pour le paiement (1-28, defaut 1er du mois)
    paymentDay: { type: 'number', default: 1 },

    // Mode de paiement prefere
    paymentMethod: {
      type: 'string', default: 'cash',
      enum: ['cash', 'transfer', 'check', 'ccp'],
    },

    // Type de bail
    leaseType: {
      type: 'string', default: 'residential',
      enum: ['residential', 'commercial', 'seasonal'],
    },

    // Statut du bail
    status: {
      type: 'string', default: 'active',
      enum: ['draft', 'active', 'expired', 'terminated', 'renewed'],
    },

    // Raison de resiliation
    terminationReason: { type: 'string' },

    // Notes (clauses particulieres, etat des lieux...)
    notes: { type: 'string' },
  },

  relations: {
    apartment: {
      target: 'Apartment',
      type: 'many-to-one',
      required: true,
    },
    tenant: {
      target: 'Tenant',
      type: 'many-to-one',
      required: true,
    },
  },

  indexes: [
    { fields: { status: 'asc' } },
    { fields: { startDate: 'desc' } },
  ],
};

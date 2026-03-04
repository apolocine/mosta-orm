/**
 * Repository de l'entite Payment
 *
 * Gere les paiements lies aux reservations.
 * Un paiement est associe a une reservation (many-to-one).
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { PaymentSchema } from '../entities/payment.schema.js';

export interface PaymentDTO {
  id: string;
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'online';
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  transactionRef?: string;
  paidAt?: string;
  notes?: string;
  reservation?: any;  // ReservationDTO quand populate
  createdAt?: string;
  updatedAt?: string;
}

export class PaymentRepository extends BaseRepository<PaymentDTO> {
  constructor(dialect: IDialect) {
    super(PaymentSchema, dialect);
  }

  /** Lister les paiements d'une reservation */
  async findByReservation(reservationId: string): Promise<PaymentDTO[]> {
    return this.findAll({ reservation: reservationId }, {
      sort: { createdAt: -1 },
    });
  }

  /** Marquer un paiement comme complete */
  async markCompleted(id: string, transactionRef?: string): Promise<PaymentDTO | null> {
    return this.update(id, {
      status: 'completed',
      paidAt: new Date().toISOString(),
      transactionRef,
    } as Partial<PaymentDTO>);
  }

  /** Rembourser un paiement */
  async refund(id: string, notes?: string): Promise<PaymentDTO | null> {
    return this.update(id, {
      status: 'refunded',
      notes: notes || 'Remboursement',
    } as Partial<PaymentDTO>);
  }

  /** Calculer le total paye pour une reservation */
  async totalPaidForReservation(reservationId: string): Promise<number> {
    const payments = await this.findAll({
      reservation: reservationId,
      status: 'completed',
    });
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }
}

/**
 * Repository de l'entite Payment — Paiements de loyer
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { PaymentSchema } from '../entities/payment.schema.js';

export interface PaymentDTO {
  id: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  paidAt?: string;
  dueDate: string;
  method?: string;
  receiptNumber?: string;
  status: string;
  daysLate: number;
  notes?: string;
  lease?: any;
  createdAt?: string;
  updatedAt?: string;
}

export class PaymentRepository extends BaseRepository<PaymentDTO> {
  constructor(dialect: IDialect) {
    super(PaymentSchema, dialect);
  }

  /** Lister les paiements d'un bail */
  async findByLease(leaseId: string) {
    return this.findAll({ lease: leaseId }, { sort: { period: -1 } });
  }

  /** Trouver les paiements en retard */
  async findLate() {
    return this.findWithRelations({ status: 'late' }, ['lease'], { sort: { dueDate: 1 } });
  }

  /** Trouver les paiements en attente */
  async findPending() {
    return this.findWithRelations({ status: 'pending' }, ['lease'], { sort: { dueDate: 1 } });
  }

  /** Marquer un paiement comme paye */
  async markPaid(id: string, amountPaid: number, method: string, receiptNumber?: string) {
    const payment = await this.findById(id);
    if (!payment) return null;

    const isPaid = amountPaid >= payment.amountDue;
    const daysLate = payment.dueDate
      ? Math.max(0, Math.floor((Date.now() - new Date(payment.dueDate).getTime()) / 86400000))
      : 0;

    return this.update(id, {
      amountPaid,
      method,
      receiptNumber,
      paidAt: new Date().toISOString(),
      status: isPaid ? 'paid' : 'partial',
      daysLate,
    } as Partial<PaymentDTO>);
  }

  /** Calculer le total des loyers percus pour un bail */
  async totalCollectedForLease(leaseId: string): Promise<number> {
    const payments = await this.findAll({ lease: leaseId, status: 'paid' });
    return payments.reduce((sum, p) => sum + p.amountPaid, 0);
  }

  /** Calculer les impayes pour un bail */
  async totalUnpaidForLease(leaseId: string): Promise<number> {
    const payments = await this.findAll({ lease: leaseId });
    return payments.reduce((sum, p) => sum + Math.max(0, p.amountDue - p.amountPaid), 0);
  }
}

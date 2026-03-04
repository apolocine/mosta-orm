/**
 * Repository de l'entite Lease — Baux
 *
 * Demontre findWithRelations (JOINs cross-dialect) :
 * un bail est toujours affiche avec son appartement et son locataire.
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect, QueryOptions } from 'mostaorm';
import { LeaseSchema } from '../entities/lease.schema.js';

export interface LeaseDTO {
  id: string;
  leaseNumber: string;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  monthlyCharges: number;
  securityDeposit: number;
  paymentDay: number;
  paymentMethod: string;
  leaseType: string;
  status: string;
  terminationReason?: string;
  notes?: string;
  apartment?: any;
  tenant?: any;
  createdAt?: string;
  updatedAt?: string;
}

let leaseCounter = 0;

export class LeaseRepository extends BaseRepository<LeaseDTO> {
  constructor(dialect: IDialect) {
    super(LeaseSchema, dialect);
  }

  /** Generer un numero de bail unique */
  generateLeaseNumber(): string {
    leaseCounter++;
    const year = new Date().getFullYear();
    return `BAIL-${year}-${String(leaseCounter).padStart(3, '0')}`;
  }

  /** Lister les baux avec details (apartment + tenant) */
  async findAllWithDetails(filter: Record<string, unknown> = {}, options?: QueryOptions) {
    return this.findWithRelations(filter, ['apartment', 'tenant'], options);
  }

  /** Trouver les baux actifs */
  async findActive() {
    return this.findWithRelations({ status: 'active' }, ['apartment', 'tenant'], { sort: { startDate: -1 } });
  }

  /** Trouver les baux d'un locataire */
  async findByTenant(tenantId: string) {
    return this.findWithRelations({ tenant: tenantId }, ['apartment'], { sort: { startDate: -1 } });
  }

  /** Trouver le bail actif d'un appartement */
  async findActiveByApartment(apartmentId: string) {
    const results = await this.findWithRelations(
      { apartment: apartmentId, status: 'active' }, ['tenant'],
    );
    return results[0] || null;
  }

  /** Resilier un bail */
  async terminate(id: string, reason: string) {
    return this.update(id, {
      status: 'terminated',
      terminationReason: reason,
      endDate: new Date().toISOString(),
    } as Partial<LeaseDTO>);
  }

  /** Renouveler un bail */
  async renew(id: string) {
    return this.update(id, { status: 'renewed' } as Partial<LeaseDTO>);
  }
}

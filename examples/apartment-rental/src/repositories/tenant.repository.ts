/**
 * Repository de l'entite Tenant
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { TenantSchema } from '../entities/tenant.schema.js';

export interface TenantDTO {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  email?: string;
  phone: string;
  phoneSecondary?: string;
  profession?: string;
  employer?: string;
  monthlyIncome?: number;
  idType?: string;
  idNumber?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  notes?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export class TenantRepository extends BaseRepository<TenantDTO> {
  constructor(dialect: IDialect) {
    super(TenantSchema, dialect);
  }

  /** Rechercher un locataire par nom, email ou telephone */
  async searchTenants(query: string) {
    return this.search(query);
  }

  /** Marquer comme ancien locataire */
  async markFormer(id: string) {
    return this.update(id, { status: 'former' } as Partial<TenantDTO>);
  }
}

/**
 * Repository de l'entite Apartment
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { ApartmentSchema } from '../entities/apartment.schema.js';

export interface ApartmentDTO {
  id: string;
  reference: string;
  title: string;
  propertyType: string;
  surface: number;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  floor: number;
  hasElevator: boolean;
  furnished: boolean;
  hasParking: boolean;
  hasBalcony: boolean;
  address: string;
  city: string;
  postalCode?: string;
  wilaya?: string;
  monthlyRent: number;
  monthlyCharges: number;
  securityDeposit: number;
  description?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export class ApartmentRepository extends BaseRepository<ApartmentDTO> {
  constructor(dialect: IDialect) {
    super(ApartmentSchema, dialect);
  }

  /** Lister les appartements disponibles */
  async findAvailable() {
    return this.findAll({ status: 'available' }, { sort: { monthlyRent: 1 } });
  }

  /** Filtrer par ville */
  async findByCity(city: string) {
    return this.findAll({ city }, { sort: { monthlyRent: 1 } });
  }

  /** Filtrer par type de bien */
  async findByType(propertyType: string) {
    return this.findAll({ propertyType, status: 'available' }, { sort: { monthlyRent: 1 } });
  }

  /** Marquer comme loue */
  async markRented(id: string) {
    return this.update(id, { status: 'rented' } as Partial<ApartmentDTO>);
  }

  /** Marquer comme disponible */
  async markAvailable(id: string) {
    return this.update(id, { status: 'available' } as Partial<ApartmentDTO>);
  }
}

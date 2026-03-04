/**
 * Repository de l'entite Passenger
 *
 * Gere les clients / passagers.
 * Methodes metier : recherche, points de fidelite, statistiques.
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { PassengerSchema } from '../entities/passenger.schema.js';

export interface PassengerDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  loyaltyPoints: number;
  totalFlights: number;
  notes?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export class PassengerRepository extends BaseRepository<PassengerDTO> {
  constructor(dialect: IDialect) {
    super(PassengerSchema, dialect);
  }

  /** Trouver un passager par email */
  async findByEmail(email: string): Promise<PassengerDTO | null> {
    return this.findOne({ email: email.toLowerCase() });
  }

  /** Ajouter des points de fidelite */
  async addPoints(id: string, points: number): Promise<PassengerDTO | null> {
    return this.increment(id, 'loyaltyPoints', points);
  }

  /** Incrementer le compteur de vols */
  async incrementFlights(id: string): Promise<PassengerDTO | null> {
    return this.increment(id, 'totalFlights', 1);
  }

  /** Rechercher un passager (nom, prenom, email, telephone) */
  async searchPassengers(query: string): Promise<PassengerDTO[]> {
    return this.search(query);
  }
}

/**
 * Repository de l'entite Reservation
 *
 * Entite centrale du systeme — lie un Passenger a une Experience
 * pour une date/heure de vol donnee.
 *
 * Demontre les relations MostaORM (findWithRelations → JOINs/populate).
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect, QueryOptions } from 'mostaorm';
import { ReservationSchema } from '../entities/reservation.schema.js';

export interface ReservationDTO {
  id: string;
  reservationNumber: string;
  flightDate: string;
  timeSlot: string;
  seats: number;
  totalPrice: number;
  paymentMethod: 'online' | 'on-site';
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'postponed';
  statusReason?: string;
  specialRequest?: string;
  pointsEarned: number;
  passenger?: any;    // PassengerDTO quand populate
  experience?: any;   // ExperienceDTO quand populate
  createdAt?: string;
  updatedAt?: string;
}

/** Compteur pour generer les numeros de reservation */
let reservationCounter = 0;

export class ReservationRepository extends BaseRepository<ReservationDTO> {
  constructor(dialect: IDialect) {
    super(ReservationSchema, dialect);
  }

  /** Generer un numero de reservation unique (RES-YYYYMMDD-XXXX) */
  generateReservationNumber(): string {
    reservationCounter++;
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(reservationCounter).padStart(4, '0');
    return `RES-${y}${m}${d}-${seq}`;
  }

  /**
   * Lister les reservations avec les relations (passenger + experience)
   * C'est ici que MostaORM montre sa puissance :
   *   - MongoDB : .populate('passenger experience')
   *   - SQL     : LEFT JOIN passengers ... LEFT JOIN experiences ...
   */
  async findAllWithDetails(
    filter: Record<string, unknown> = {},
    options?: QueryOptions,
  ): Promise<ReservationDTO[]> {
    return this.findWithRelations(filter, ['passenger', 'experience'], options);
  }

  /** Trouver une reservation par numero avec details */
  async findByNumber(reservationNumber: string): Promise<ReservationDTO | null> {
    const results = await this.findWithRelations(
      { reservationNumber },
      ['passenger', 'experience'],
    );
    return results[0] || null;
  }

  /** Lister les reservations d'un passager */
  async findByPassenger(passengerId: string): Promise<ReservationDTO[]> {
    return this.findWithRelations(
      { passenger: passengerId },
      ['experience'],
      { sort: { flightDate: -1 } },
    );
  }

  /** Lister les reservations pour une date de vol */
  async findByDate(date: string): Promise<ReservationDTO[]> {
    return this.findWithRelations(
      { flightDate: date },
      ['passenger', 'experience'],
      { sort: { timeSlot: 1 } },
    );
  }

  /** Confirmer une reservation */
  async confirm(id: string): Promise<ReservationDTO | null> {
    return this.update(id, { status: 'confirmed' } as Partial<ReservationDTO>);
  }

  /** Annuler une reservation */
  async cancel(id: string, reason: string): Promise<ReservationDTO | null> {
    return this.update(id, {
      status: 'cancelled',
      statusReason: reason,
    } as Partial<ReservationDTO>);
  }

  /** Reporter une reservation (meteo defavorable) */
  async postpone(id: string, reason: string): Promise<ReservationDTO | null> {
    return this.update(id, {
      status: 'postponed',
      statusReason: reason,
    } as Partial<ReservationDTO>);
  }

  /** Marquer comme terminee + attribution de points */
  async complete(id: string, pointsEarned: number): Promise<ReservationDTO | null> {
    return this.update(id, {
      status: 'completed',
      pointsEarned,
    } as Partial<ReservationDTO>);
  }
}

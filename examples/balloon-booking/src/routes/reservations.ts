/**
 * Routes CRUD pour les Reservations
 *
 * GET    /api/reservations           — Liste des reservations (avec relations)
 * GET    /api/reservations/:id       — Detail d'une reservation
 * POST   /api/reservations           — Creer une reservation
 * PUT    /api/reservations/:id       — Modifier une reservation
 * PATCH  /api/reservations/:id/confirm   — Confirmer
 * PATCH  /api/reservations/:id/cancel    — Annuler
 * PATCH  /api/reservations/:id/postpone  — Reporter (meteo)
 * PATCH  /api/reservations/:id/complete  — Marquer terminee
 * DELETE /api/reservations/:id       — Supprimer une reservation
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import { ExperienceRepository } from '../repositories/experience.repository.js';
import { PassengerRepository } from '../repositories/passenger.repository.js';
import type { IDialect } from 'mostaorm';

export function reservationRoutes(dialect: IDialect): Router {
  const router = Router();
  const repo = new ReservationRepository(dialect);
  const expRepo = new ExperienceRepository(dialect);
  const passengerRepo = new PassengerRepository(dialect);

  // GET / — Liste avec relations (passenger + experience)
  router.get('/', async (req, res) => {
    try {
      const { status, date, page = '1', limit = '20' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      if (date) filter.flightDate = date;

      const total = await repo.count(filter);
      const reservations = await repo.findAllWithDetails(filter, {
        sort: { flightDate: -1, timeSlot: 1 },
        skip: (pageNum - 1) * limitNum,
        limit: limitNum,
      });

      res.json({ data: reservations, total, page: pageNum, limit: limitNum });
    } catch (err) {
      console.error('GET /reservations:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // GET /:id — Detail avec relations
  router.get('/:id', async (req, res) => {
    try {
      const reservation = await repo.findByIdWithRelations(
        req.params.id, ['passenger', 'experience'],
      );
      if (!reservation) return res.status(404).json({ error: 'Reservation introuvable' });
      res.json({ data: reservation });
    } catch (err) {
      console.error('GET /reservations/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // POST / — Creer une reservation
  router.post('/', async (req, res) => {
    try {
      const { passengerId, experienceId, flightDate, timeSlot, seats, paymentMethod, specialRequest } = req.body;

      if (!passengerId || !experienceId || !flightDate || !timeSlot || !seats || !paymentMethod) {
        return res.status(400).json({
          error: 'Champs obligatoires: passengerId, experienceId, flightDate, timeSlot, seats, paymentMethod',
        });
      }

      // Verifier que le passager existe
      const passenger = await passengerRepo.findById(passengerId);
      if (!passenger) return res.status(404).json({ error: 'Passager introuvable' });

      // Verifier que l'experience existe
      const experience = await expRepo.findById(experienceId);
      if (!experience) return res.status(404).json({ error: 'Experience introuvable' });

      // Verifier le nombre de places
      if (seats > experience.maxPassengers) {
        return res.status(400).json({
          error: `Maximum ${experience.maxPassengers} places pour "${experience.name}"`,
        });
      }

      // Calculer le prix total
      const totalPrice = experience.pricePerPerson * seats;

      // Generer le numero de reservation
      const reservationNumber = repo.generateReservationNumber();

      // Calculer les points de fidelite (10 points par 1000 DA)
      const pointsEarned = Math.floor(totalPrice / 1000) * 10;

      const reservation = await repo.create({
        reservationNumber,
        flightDate,
        timeSlot,
        seats,
        totalPrice,
        paymentMethod,
        specialRequest,
        pointsEarned,
        passenger: passengerId,
        experience: experienceId,
      } as any);

      res.status(201).json({ data: reservation });
    } catch (err) {
      console.error('POST /reservations:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PUT /:id — Modifier
  router.put('/:id', async (req, res) => {
    try {
      const reservation = await repo.update(req.params.id, req.body);
      if (!reservation) return res.status(404).json({ error: 'Reservation introuvable' });
      res.json({ data: reservation });
    } catch (err) {
      console.error('PUT /reservations/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PATCH /:id/confirm — Confirmer une reservation
  router.patch('/:id/confirm', async (req, res) => {
    try {
      const reservation = await repo.confirm(req.params.id);
      if (!reservation) return res.status(404).json({ error: 'Reservation introuvable' });
      res.json({ data: reservation, message: 'Reservation confirmee' });
    } catch (err) {
      console.error('PATCH confirm:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PATCH /:id/cancel — Annuler une reservation
  router.patch('/:id/cancel', async (req, res) => {
    try {
      const { reason } = req.body;
      const reservation = await repo.cancel(req.params.id, reason || 'Annulation par le client');
      if (!reservation) return res.status(404).json({ error: 'Reservation introuvable' });
      res.json({ data: reservation, message: 'Reservation annulee' });
    } catch (err) {
      console.error('PATCH cancel:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PATCH /:id/postpone — Reporter (meteo defavorable)
  router.patch('/:id/postpone', async (req, res) => {
    try {
      const { reason } = req.body;
      const reservation = await repo.postpone(req.params.id, reason || 'Conditions meteo defavorables');
      if (!reservation) return res.status(404).json({ error: 'Reservation introuvable' });
      res.json({ data: reservation, message: 'Reservation reportee' });
    } catch (err) {
      console.error('PATCH postpone:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PATCH /:id/complete — Marquer comme terminee + points
  router.patch('/:id/complete', async (req, res) => {
    try {
      const reservation = await repo.findById(req.params.id);
      if (!reservation) return res.status(404).json({ error: 'Reservation introuvable' });

      // Marquer la reservation comme terminee
      const updated = await repo.complete(req.params.id, reservation.pointsEarned);

      // Attribuer les points au passager et incrementer son compteur de vols
      if ((reservation as any).passenger) {
        const passengerId = typeof (reservation as any).passenger === 'string'
          ? (reservation as any).passenger
          : (reservation as any).passenger.id || (reservation as any).passenger;
        await passengerRepo.addPoints(passengerId, reservation.pointsEarned);
        await passengerRepo.incrementFlights(passengerId);
      }

      res.json({ data: updated, message: `Vol termine — ${reservation.pointsEarned} points attribues` });
    } catch (err) {
      console.error('PATCH complete:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // DELETE /:id — Supprimer
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await repo.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Reservation introuvable' });
      res.json({ message: 'Reservation supprimee' });
    } catch (err) {
      console.error('DELETE /reservations/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}

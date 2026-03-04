/**
 * Routes CRUD pour les Payments (paiements)
 *
 * GET    /api/payments                     — Liste des paiements
 * GET    /api/payments/reservation/:resId  — Paiements d'une reservation
 * POST   /api/payments                     — Enregistrer un paiement
 * PATCH  /api/payments/:id/complete        — Marquer comme paye
 * PATCH  /api/payments/:id/refund          — Rembourser
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import { PaymentRepository } from '../repositories/payment.repository.js';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import type { IDialect } from 'mostaorm';

export function paymentRoutes(dialect: IDialect): Router {
  const router = Router();
  const repo = new PaymentRepository(dialect);
  const resRepo = new ReservationRepository(dialect);

  // GET / — Liste des paiements
  router.get('/', async (req, res) => {
    try {
      const { status } = req.query as Record<string, string>;
      const filter = status ? { status } : {};
      const payments = await repo.findAll(filter, { sort: { createdAt: -1 } });
      res.json({ data: payments });
    } catch (err) {
      console.error('GET /payments:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // GET /reservation/:resId — Paiements d'une reservation
  router.get('/reservation/:resId', async (req, res) => {
    try {
      const payments = await repo.findByReservation(req.params.resId);
      const totalPaid = await repo.totalPaidForReservation(req.params.resId);
      res.json({ data: payments, totalPaid });
    } catch (err) {
      console.error('GET /payments/reservation:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // POST / — Enregistrer un paiement
  router.post('/', async (req, res) => {
    try {
      const { reservationId, amount, method, notes } = req.body;

      if (!reservationId || !amount || !method) {
        return res.status(400).json({ error: 'Champs obligatoires: reservationId, amount, method' });
      }

      // Verifier que la reservation existe
      const reservation = await resRepo.findById(reservationId);
      if (!reservation) return res.status(404).json({ error: 'Reservation introuvable' });

      const payment = await repo.create({
        reservation: reservationId,
        amount,
        method,
        notes,
      } as any);

      res.status(201).json({ data: payment });
    } catch (err) {
      console.error('POST /payments:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PATCH /:id/complete — Marquer comme paye
  router.patch('/:id/complete', async (req, res) => {
    try {
      const { transactionRef } = req.body;
      const payment = await repo.markCompleted(req.params.id, transactionRef);
      if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
      res.json({ data: payment, message: 'Paiement confirme' });
    } catch (err) {
      console.error('PATCH complete:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PATCH /:id/refund — Rembourser
  router.patch('/:id/refund', async (req, res) => {
    try {
      const { notes } = req.body;
      const payment = await repo.refund(req.params.id, notes);
      if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
      res.json({ data: payment, message: 'Paiement rembourse' });
    } catch (err) {
      console.error('PATCH refund:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}

/**
 * Routes CRUD pour les Passengers (clients)
 *
 * GET    /api/passengers           — Liste des passagers
 * GET    /api/passengers/:id       — Detail d'un passager
 * POST   /api/passengers           — Creer un passager
 * PUT    /api/passengers/:id       — Modifier un passager
 * DELETE /api/passengers/:id       — Supprimer un passager
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import { PassengerRepository } from '../repositories/passenger.repository.js';
import type { IDialect } from 'mostaorm';

export function passengerRoutes(dialect: IDialect): Router {
  const router = Router();
  const repo = new PassengerRepository(dialect);

  // GET / — Liste avec recherche et pagination
  router.get('/', async (req, res) => {
    try {
      const { q, page = '1', limit = '20' } = req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

      let passengers;
      let total;

      if (q && q.trim()) {
        passengers = await repo.searchPassengers(q.trim());
        total = passengers.length;
        passengers = passengers.slice((pageNum - 1) * limitNum, pageNum * limitNum);
      } else {
        total = await repo.count();
        passengers = await repo.findAll({}, {
          sort: { createdAt: -1 },
          skip: (pageNum - 1) * limitNum,
          limit: limitNum,
        });
      }

      res.json({ data: passengers, total, page: pageNum, limit: limitNum });
    } catch (err) {
      console.error('GET /passengers:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // GET /:id — Detail
  router.get('/:id', async (req, res) => {
    try {
      const passenger = await repo.findById(req.params.id);
      if (!passenger) return res.status(404).json({ error: 'Passager introuvable' });
      res.json({ data: passenger });
    } catch (err) {
      console.error('GET /passengers/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // POST / — Creer
  router.post('/', async (req, res) => {
    try {
      const { firstName, lastName, email, phone, dateOfBirth, notes } = req.body;
      if (!firstName || !lastName || !email || !phone) {
        return res.status(400).json({ error: 'Champs obligatoires: firstName, lastName, email, phone' });
      }

      // Verifier si l'email existe deja
      const existing = await repo.findByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Un passager avec cet email existe deja', data: existing });
      }

      const passenger = await repo.create({ firstName, lastName, email, phone, dateOfBirth, notes });
      res.status(201).json({ data: passenger });
    } catch (err) {
      console.error('POST /passengers:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PUT /:id — Modifier
  router.put('/:id', async (req, res) => {
    try {
      const passenger = await repo.update(req.params.id, req.body);
      if (!passenger) return res.status(404).json({ error: 'Passager introuvable' });
      res.json({ data: passenger });
    } catch (err) {
      console.error('PUT /passengers/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // DELETE /:id — Supprimer
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await repo.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Passager introuvable' });
      res.json({ message: 'Passager supprime' });
    } catch (err) {
      console.error('DELETE /passengers/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}

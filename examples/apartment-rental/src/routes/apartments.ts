/**
 * Routes CRUD pour les appartements
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import type { ApartmentRepository } from '../repositories/apartment.repository.js';

export function apartmentRoutes(repo: ApartmentRepository) {
  const r = Router();

  /** GET / — liste (filtres: status, city, propertyType, search) */
  r.get('/', async (req, res) => {
    try {
      const { status, city, propertyType, search } = req.query;
      if (search) return res.json(await repo.search(String(search)));
      if (city) return res.json(await repo.findByCity(String(city)));
      if (propertyType) return res.json(await repo.findByType(String(propertyType)));
      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      res.json(await repo.findAll(filter, { sort: { monthlyRent: 1 } }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /:id */
  r.get('/:id', async (req, res) => {
    try {
      const doc = await repo.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Appartement introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST / */
  r.post('/', async (req, res) => {
    try {
      res.status(201).json(await repo.create(req.body));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /** PUT /:id */
  r.put('/:id', async (req, res) => {
    try {
      const doc = await repo.update(req.params.id, req.body);
      if (!doc) return res.status(404).json({ error: 'Appartement introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /** DELETE /:id */
  r.delete('/:id', async (req, res) => {
    try {
      const ok = await repo.delete(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Appartement introuvable' });
      res.json({ deleted: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /:id/mark-rented */
  r.patch('/:id/mark-rented', async (req, res) => {
    try {
      const doc = await repo.markRented(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Appartement introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /:id/mark-available */
  r.patch('/:id/mark-available', async (req, res) => {
    try {
      const doc = await repo.markAvailable(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Appartement introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}

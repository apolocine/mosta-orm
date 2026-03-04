/**
 * Routes CRUD pour les Experiences (types de vols)
 *
 * GET    /api/experiences           — Catalogue des experiences
 * GET    /api/experiences/:id       — Detail d'une experience
 * POST   /api/experiences           — Creer une experience
 * PUT    /api/experiences/:id       — Modifier une experience
 * DELETE /api/experiences/:id       — Supprimer une experience
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import { ExperienceRepository } from '../repositories/experience.repository.js';
import type { IDialect } from 'mostaorm';

export function experienceRoutes(dialect: IDialect): Router {
  const router = Router();
  const repo = new ExperienceRepository(dialect);

  // GET / — Catalogue des experiences (filtrable par categorie)
  router.get('/', async (req, res) => {
    try {
      const { category } = req.query as Record<string, string>;
      const experiences = category
        ? await repo.findByCategory(category)
        : await repo.findActive();
      res.json({ data: experiences });
    } catch (err) {
      console.error('GET /experiences:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // GET /:id — Detail
  router.get('/:id', async (req, res) => {
    try {
      const exp = await repo.findById(req.params.id);
      if (!exp) return res.status(404).json({ error: 'Experience introuvable' });
      res.json({ data: exp });
    } catch (err) {
      console.error('GET /experiences/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // POST / — Creer
  router.post('/', async (req, res) => {
    try {
      const { name, description, durationMinutes, pricePerPerson, maxPassengers, includes, category, imageUrl, sortOrder } = req.body;
      if (!name || !durationMinutes || !pricePerPerson || !maxPassengers || !category) {
        return res.status(400).json({ error: 'Champs obligatoires: name, durationMinutes, pricePerPerson, maxPassengers, category' });
      }
      // Generer le slug a partir du nom
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const exp = await repo.create({ name, slug, description, durationMinutes, pricePerPerson, maxPassengers, includes, category, imageUrl, sortOrder: sortOrder || 0 });
      res.status(201).json({ data: exp });
    } catch (err: any) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('duplicate')) {
        return res.status(409).json({ error: 'Une experience avec ce nom existe deja' });
      }
      console.error('POST /experiences:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // PUT /:id — Modifier
  router.put('/:id', async (req, res) => {
    try {
      const exp = await repo.update(req.params.id, req.body);
      if (!exp) return res.status(404).json({ error: 'Experience introuvable' });
      res.json({ data: exp });
    } catch (err) {
      console.error('PUT /experiences/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // DELETE /:id — Supprimer
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await repo.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Experience introuvable' });
      res.json({ message: 'Experience supprimee' });
    } catch (err) {
      console.error('DELETE /experiences/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}

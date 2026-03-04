/**
 * Routes CRUD pour les baux (leases)
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import type { LeaseRepository } from '../repositories/lease.repository.js';

export function leaseRoutes(repo: LeaseRepository) {
  const r = Router();

  /** GET / — liste avec relations (filtre: status, tenant) */
  r.get('/', async (req, res) => {
    try {
      const { status, tenant } = req.query;
      if (tenant) return res.json(await repo.findByTenant(String(tenant)));
      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      res.json(await repo.findAllWithDetails(filter, { sort: { startDate: -1 } }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /active — baux actifs */
  r.get('/active', async (_req, res) => {
    try {
      res.json(await repo.findActive());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /:id */
  r.get('/:id', async (req, res) => {
    try {
      const results = await repo.findAllWithDetails({ id: req.params.id });
      if (!results.length) return res.status(404).json({ error: 'Bail introuvable' });
      res.json(results[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** POST / */
  r.post('/', async (req, res) => {
    try {
      const data = { ...req.body };
      if (!data.leaseNumber) data.leaseNumber = repo.generateLeaseNumber();
      res.status(201).json(await repo.create(data));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /** PUT /:id */
  r.put('/:id', async (req, res) => {
    try {
      const doc = await repo.update(req.params.id, req.body);
      if (!doc) return res.status(404).json({ error: 'Bail introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /** DELETE /:id */
  r.delete('/:id', async (req, res) => {
    try {
      const ok = await repo.delete(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Bail introuvable' });
      res.json({ deleted: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /:id/terminate */
  r.patch('/:id/terminate', async (req, res) => {
    try {
      const { reason } = req.body;
      const doc = await repo.terminate(req.params.id, reason || 'Résiliation');
      if (!doc) return res.status(404).json({ error: 'Bail introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /:id/renew */
  r.patch('/:id/renew', async (req, res) => {
    try {
      const doc = await repo.renew(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Bail introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}

/**
 * Routes CRUD pour les locataires
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import type { TenantRepository } from '../repositories/tenant.repository.js';

export function tenantRoutes(repo: TenantRepository) {
  const r = Router();

  /** GET / — liste (filtre: status, search) */
  r.get('/', async (req, res) => {
    try {
      const { status, search } = req.query;
      if (search) return res.json(await repo.searchTenants(String(search)));
      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      res.json(await repo.findAll(filter, { sort: { lastName: 1 } }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /:id */
  r.get('/:id', async (req, res) => {
    try {
      const doc = await repo.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Locataire introuvable' });
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
      if (!doc) return res.status(404).json({ error: 'Locataire introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /** DELETE /:id */
  r.delete('/:id', async (req, res) => {
    try {
      const ok = await repo.delete(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Locataire introuvable' });
      res.json({ deleted: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /:id/mark-former */
  r.patch('/:id/mark-former', async (req, res) => {
    try {
      const doc = await repo.markFormer(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Locataire introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}

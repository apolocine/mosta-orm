/**
 * Routes CRUD pour les paiements de loyer
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import type { PaymentRepository } from '../repositories/payment.repository.js';

export function paymentRoutes(repo: PaymentRepository) {
  const r = Router();

  /** GET / — liste (filtre: lease, status) */
  r.get('/', async (req, res) => {
    try {
      const { lease, status } = req.query;
      if (lease) return res.json(await repo.findByLease(String(lease)));
      if (status === 'late') return res.json(await repo.findLate());
      if (status === 'pending') return res.json(await repo.findPending());
      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      res.json(await repo.findAll(filter, { sort: { dueDate: -1 } }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /totals/:leaseId — totaux d'un bail */
  r.get('/totals/:leaseId', async (req, res) => {
    try {
      const [collected, unpaid] = await Promise.all([
        repo.totalCollectedForLease(req.params.leaseId),
        repo.totalUnpaidForLease(req.params.leaseId),
      ]);
      res.json({ collected, unpaid });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** GET /:id */
  r.get('/:id', async (req, res) => {
    try {
      const doc = await repo.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Paiement introuvable' });
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
      if (!doc) return res.status(404).json({ error: 'Paiement introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  /** DELETE /:id */
  r.delete('/:id', async (req, res) => {
    try {
      const ok = await repo.delete(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Paiement introuvable' });
      res.json({ deleted: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /** PATCH /:id/mark-paid */
  r.patch('/:id/mark-paid', async (req, res) => {
    try {
      const { amountPaid, method, receiptNumber } = req.body;
      if (!amountPaid || !method) {
        return res.status(400).json({ error: 'amountPaid et method requis' });
      }
      const doc = await repo.markPaid(req.params.id, amountPaid, method, receiptNumber);
      if (!doc) return res.status(404).json({ error: 'Paiement introuvable' });
      res.json(doc);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}

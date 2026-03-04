/**
 * Routes CRUD pour les contacts
 *
 * 5 routes REST standard :
 *   GET    /api/contacts       — Liste avec recherche et pagination
 *   GET    /api/contacts/:id   — Detail d'un contact
 *   POST   /api/contacts       — Creer un contact
 *   PUT    /api/contacts/:id   — Modifier un contact
 *   DELETE /api/contacts/:id   — Supprimer un contact
 *
 * Toutes les routes utilisent le ContactRepository qui abstrait
 * la base de donnees via MostaORM. Le meme code fonctionne sur
 * MongoDB, SQLite, PostgreSQL, MySQL, etc.
 *
 * Author: Dr Hamid MADANI <drmdh@msn.com>
 */
import { Router } from 'express';
import { ContactRepository } from '../repositories/contact.repository.js';
import type { IDialect } from 'mostaorm';

/**
 * Cree et retourne le routeur Express avec les 5 routes CRUD.
 *
 * @param dialect - Dialecte MostaORM connecte (injecte par le serveur)
 * @returns Routeur Express configure
 */
export function contactRoutes(dialect: IDialect): Router {
  const router = Router();
  const repo = new ContactRepository(dialect);

  // ================================================================
  // GET /api/contacts — Liste des contacts
  //
  // Query params :
  //   ?q=ahmed        — Recherche dans nom, prenom, email, entreprise
  //   ?status=active  — Filtrer par statut (active | archived)
  //   ?page=1         — Numero de page (defaut: 1)
  //   ?limit=20       — Nombre par page (defaut: 20)
  //   ?sort=lastName  — Champ de tri (defaut: createdAt)
  //   ?order=asc      — Ordre de tri : asc ou desc (defaut: desc)
  // ================================================================
  router.get('/', async (req, res) => {
    try {
      const {
        q,
        status,
        page = '1',
        limit = '20',
        sort = 'createdAt',
        order = 'desc',
      } = req.query as Record<string, string>;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;
      const sortDir = order === 'asc' ? 1 : -1;

      // Construire le filtre
      let contacts;
      let total;

      if (q && q.trim()) {
        // Recherche textuelle dans tous les champs string
        contacts = await repo.searchContacts(q.trim());
        // Filtrer par statut cote application si necessaire
        if (status) {
          contacts = contacts.filter(c => c.status === status);
        }
        total = contacts.length;
        // Pagination manuelle sur les resultats de recherche
        contacts = contacts.slice(skip, skip + limitNum);
      } else {
        // Liste classique avec filtre optionnel
        const filter = status ? { status } : {};
        total = await repo.count(filter);
        contacts = await repo.findAll(filter, {
          sort: { [sort]: sortDir as 1 | -1 },
          skip,
          limit: limitNum,
        });
      }

      res.json({
        data: contacts,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      });
    } catch (err) {
      console.error('Erreur GET /api/contacts:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ================================================================
  // GET /api/contacts/:id — Detail d'un contact
  // ================================================================
  router.get('/:id', async (req, res) => {
    try {
      const contact = await repo.findById(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: 'Contact introuvable' });
      }
      res.json({ data: contact });
    } catch (err) {
      console.error('Erreur GET /api/contacts/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ================================================================
  // POST /api/contacts — Creer un contact
  //
  // Body JSON attendu :
  // {
  //   "firstName": "Ahmed",
  //   "lastName": "Ben Ali",
  //   "email": "ahmed@example.com",  (optionnel)
  //   "phone": "0555123456",         (optionnel)
  //   "company": "Acme Corp",        (optionnel)
  //   "notes": "Client VIP"          (optionnel)
  // }
  // ================================================================
  router.post('/', async (req, res) => {
    try {
      const { firstName, lastName, email, phone, company, notes } = req.body;

      // Validation des champs obligatoires
      if (!firstName || !lastName) {
        return res.status(400).json({
          error: 'Les champs firstName et lastName sont obligatoires',
        });
      }

      const contact = await repo.create({
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
        company: company || undefined,
        notes: notes || undefined,
      });

      res.status(201).json({ data: contact });
    } catch (err: any) {
      // Gerer l'erreur d'email duplique
      if (err.message?.includes('UNIQUE') || err.message?.includes('duplicate') || err.code === 11000) {
        return res.status(409).json({ error: 'Un contact avec cet email existe deja' });
      }
      console.error('Erreur POST /api/contacts:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ================================================================
  // PUT /api/contacts/:id — Modifier un contact
  //
  // Body JSON : memes champs que POST (seuls les champs fournis sont modifies)
  // ================================================================
  router.put('/:id', async (req, res) => {
    try {
      const { firstName, lastName, email, phone, company, notes, status } = req.body;

      // Construire l'objet de mise a jour (seulement les champs presents)
      const updateData: Record<string, unknown> = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email || undefined;
      if (phone !== undefined) updateData.phone = phone || undefined;
      if (company !== undefined) updateData.company = company || undefined;
      if (notes !== undefined) updateData.notes = notes || undefined;
      if (status !== undefined) updateData.status = status;

      const contact = await repo.update(req.params.id, updateData as any);
      if (!contact) {
        return res.status(404).json({ error: 'Contact introuvable' });
      }

      res.json({ data: contact });
    } catch (err: any) {
      if (err.message?.includes('UNIQUE') || err.message?.includes('duplicate') || err.code === 11000) {
        return res.status(409).json({ error: 'Un contact avec cet email existe deja' });
      }
      console.error('Erreur PUT /api/contacts/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  // ================================================================
  // DELETE /api/contacts/:id — Supprimer un contact
  //
  // Suppression definitive (pas de soft delete).
  // Pour archiver sans supprimer, utiliser PUT avec status: 'archived'.
  // ================================================================
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await repo.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Contact introuvable' });
      }
      res.json({ message: 'Contact supprime' });
    } catch (err) {
      console.error('Erreur DELETE /api/contacts/:id:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  return router;
}

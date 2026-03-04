/**
 * Repository de l'entite Contact
 *
 * Etend BaseRepository<ContactDTO> pour heriter de toutes les
 * operations CRUD generiques, puis ajoute des methodes metier
 * specifiques aux contacts.
 *
 * Equivalent Hibernate : @Repository / extends JpaRepository<Contact, String>
 *
 * Author: Dr Hamid MADANI <drmdh@msn.com>
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { ContactSchema } from '../entities/contact.schema.js';

// ----------------------------------------------------------------
// DTO — Data Transfer Object
// C'est le type TypeScript des objets retournes par le repository.
// Utilise 'id' (pas '_id') grace a la normalisation automatique.
// ----------------------------------------------------------------
export interface ContactDTO {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export class ContactRepository extends BaseRepository<ContactDTO> {
  /**
   * Constructeur — recoit le dialecte connecte (injecte par le serveur)
   *
   * @param dialect - Instance du dialecte MostaORM (SQLite, MongoDB, Postgres...)
   */
  constructor(dialect: IDialect) {
    super(ContactSchema, dialect);
  }

  /**
   * Trouver tous les contacts avec un statut specifique
   *
   * @param status - 'active' ou 'archived'
   * @returns Liste des contacts filtres
   */
  async findByStatus(status: string): Promise<ContactDTO[]> {
    return this.findAll({ status });
  }

  /**
   * Archiver un contact (soft delete)
   * Au lieu de supprimer, on change le statut en 'archived'.
   *
   * @param id - ID du contact a archiver
   * @returns Le contact mis a jour
   */
  async archive(id: string): Promise<ContactDTO | null> {
    return this.update(id, { status: 'archived' } as Partial<ContactDTO>);
  }

  /**
   * Rechercher des contacts par mot-cle
   * Cherche dans tous les champs texte du schema (firstName, lastName, email, etc.)
   *
   * @param query - Terme de recherche
   * @returns Contacts correspondants
   */
  async searchContacts(query: string): Promise<ContactDTO[]> {
    return this.search(query);
  }
}

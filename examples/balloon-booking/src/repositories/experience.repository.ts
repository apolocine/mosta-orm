/**
 * Repository de l'entite Experience
 *
 * Gere les types de vols en montgolfiere (catalogue).
 * Methodes metier : tri par categorie, filtrage par statut.
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { ExperienceSchema } from '../entities/experience.schema.js';

export interface ExperienceDTO {
  id: string;
  name: string;
  slug: string;
  description?: string;
  durationMinutes: number;
  pricePerPerson: number;
  maxPassengers: number;
  includes?: string;
  category: 'standard' | 'premium' | 'celebration' | 'vip';
  imageUrl?: string;
  sortOrder: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export class ExperienceRepository extends BaseRepository<ExperienceDTO> {
  constructor(dialect: IDialect) {
    super(ExperienceSchema, dialect);
  }

  /** Lister les experiences actives triees par categorie puis sortOrder */
  async findActive(): Promise<ExperienceDTO[]> {
    return this.findAll({ status: 'active' }, {
      sort: { sortOrder: 1 },
    });
  }

  /** Trouver par slug (pour les URLs) */
  async findBySlug(slug: string): Promise<ExperienceDTO | null> {
    return this.findOne({ slug });
  }

  /** Lister par categorie */
  async findByCategory(category: string): Promise<ExperienceDTO[]> {
    return this.findAll({ category, status: 'active' }, {
      sort: { sortOrder: 1 },
    });
  }
}

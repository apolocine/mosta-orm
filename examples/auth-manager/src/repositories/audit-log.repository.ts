/**
 * Repository de l'entite AuditLog
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { BaseRepository } from 'mostaorm';
import type { IDialect } from 'mostaorm';
import { AuditLogSchema } from '../entities/audit-log.schema.js';

export interface AuditLogDTO {
  id: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  success: boolean;
  user: any;
  createdAt?: string;
  updatedAt?: string;
}

export class AuditLogRepository extends BaseRepository<AuditLogDTO> {
  constructor(dialect: IDialect) {
    super(AuditLogSchema, dialect);
  }

  /** Enregistrer un evenement d'audit */
  async log(data: {
    userId: string; action: string; success?: boolean;
    ipAddress?: string; userAgent?: string; details?: string;
  }): Promise<AuditLogDTO> {
    return this.create({
      user: data.userId,
      action: data.action,
      success: data.success !== false,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: data.details,
    } as Partial<AuditLogDTO>);
  }

  /** Journal d'un utilisateur */
  async findByUser(userId: string) {
    return this.findAll({ user: userId }, { sort: { createdAt: -1 }, limit: 50 });
  }

  /** Dernieres tentatives echouees */
  async findRecentFailures(limit = 20) {
    return this.findWithRelations({ success: false }, ['user'], { sort: { createdAt: -1 }, limit });
  }

  /** Journal global recent */
  async findRecent(limit = 50) {
    return this.findWithRelations({}, ['user'], { sort: { createdAt: -1 }, limit });
  }
}

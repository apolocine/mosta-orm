/**
 * Route Dashboard — statistiques du parc locatif
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import { Router } from 'express';
import type { ApartmentRepository } from '../repositories/apartment.repository.js';
import type { TenantRepository } from '../repositories/tenant.repository.js';
import type { LeaseRepository } from '../repositories/lease.repository.js';
import type { PaymentRepository } from '../repositories/payment.repository.js';

interface Repos {
  apartments: ApartmentRepository;
  tenants: TenantRepository;
  leases: LeaseRepository;
  payments: PaymentRepository;
}

export function dashboardRoutes(repos: Repos) {
  const r = Router();

  /** GET / — vue d'ensemble */
  r.get('/', async (_req, res) => {
    try {
      const [allApartments, allTenants, activeLeases, allPayments] = await Promise.all([
        repos.apartments.findAll(),
        repos.tenants.findAll(),
        repos.leases.findActive(),
        repos.payments.findAll(),
      ]);

      const rented = allApartments.filter(a => a.status === 'rented').length;
      const available = allApartments.filter(a => a.status === 'available').length;
      const occupancyRate = allApartments.length > 0
        ? Math.round((rented / allApartments.length) * 100) : 0;

      const totalCollected = allPayments
        .filter(p => p.status === 'paid')
        .reduce((s, p) => s + p.amountPaid, 0);

      const totalUnpaid = allPayments
        .filter(p => ['pending', 'late', 'partial'].includes(p.status))
        .reduce((s, p) => s + Math.max(0, p.amountDue - p.amountPaid), 0);

      const latePayments = allPayments.filter(p => p.status === 'late').length;

      const expectedMonthly = activeLeases.reduce(
        (s, l) => s + (l.monthlyRent || 0) + (l.monthlyCharges || 0), 0,
      );

      res.json({
        apartments: {
          total: allApartments.length,
          rented,
          available,
          maintenance: allApartments.filter(a => a.status === 'maintenance').length,
          occupancyRate,
        },
        tenants: {
          total: allTenants.length,
          active: allTenants.filter(t => t.status === 'active').length,
          former: allTenants.filter(t => t.status === 'former').length,
        },
        leases: {
          active: activeLeases.length,
          expectedMonthly,
        },
        payments: {
          totalCollected,
          totalUnpaid,
          latePayments,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}

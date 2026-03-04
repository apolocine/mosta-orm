/**
 * Serveur Express — Gestion locative (Apartment Rental)
 * Exemple MostaORM multi-entites avec relations
 *
 * Port : 3002 (defaut)
 * Dialect : SQLite par defaut, configurable via DB_DIALECT + SGBD_URI
 *
 * Author: Dr Hamid MADANI drmdh@msn.com
 */
import express from 'express';
import { createConnection } from 'mostaorm';
import { ApartmentSchema } from './entities/apartment.schema.js';
import { TenantSchema } from './entities/tenant.schema.js';
import { LeaseSchema } from './entities/lease.schema.js';
import { PaymentSchema } from './entities/payment.schema.js';
import { ApartmentRepository } from './repositories/apartment.repository.js';
import { TenantRepository } from './repositories/tenant.repository.js';
import { LeaseRepository } from './repositories/lease.repository.js';
import { PaymentRepository } from './repositories/payment.repository.js';
import { apartmentRoutes } from './routes/apartments.js';
import { tenantRoutes } from './routes/tenants.js';
import { leaseRoutes } from './routes/leases.js';
import { paymentRoutes } from './routes/payments.js';
import { dashboardRoutes } from './routes/dashboard.js';

const PORT = Number(process.env.PORT) || 3002;

async function main() {
  /* ── Connexion MostaORM ── */
  const dialect = await createConnection(
    {
      dialect: (process.env.DB_DIALECT as any) || 'sqlite',
      uri: process.env.SGBD_URI || './data/apartment-rental.db',
      schemaStrategy: 'update',
    },
    [ApartmentSchema, TenantSchema, LeaseSchema, PaymentSchema],
  );

  /* ── Repositories ── */
  const apartments = new ApartmentRepository(dialect);
  const tenants = new TenantRepository(dialect);
  const leases = new LeaseRepository(dialect);
  const payments = new PaymentRepository(dialect);

  /* ── Seed si la base est vide ── */
  const existing = await apartments.findAll();
  if (existing.length === 0) {
    console.log('Base vide — insertion des donnees de demonstration...');
    await seedData(apartments, tenants, leases, payments);
  }

  /* ── Express ── */
  const app = express();
  app.use(express.json());
  app.use(express.static('public'));

  app.use('/api/apartments', apartmentRoutes(apartments));
  app.use('/api/tenants', tenantRoutes(tenants));
  app.use('/api/leases', leaseRoutes(leases));
  app.use('/api/payments', paymentRoutes(payments));
  app.use('/api/dashboard', dashboardRoutes({ apartments, tenants, leases, payments }));

  app.listen(PORT, () => {
    console.log(`Apartment Rental — http://localhost:${PORT}`);
  });
}

/* ── Donnees de demonstration ── */
async function seedData(
  aptRepo: ApartmentRepository,
  tenRepo: TenantRepository,
  leaseRepo: LeaseRepository,
  payRepo: PaymentRepository,
) {
  // 6 appartements (parc diversifie)
  const apts = await Promise.all([
    aptRepo.create({
      reference: 'APT-001', title: 'Studio Centre-Ville',
      propertyType: 'studio', surface: 32, rooms: 1, bedrooms: 0, bathrooms: 1,
      floor: 3, hasElevator: true, furnished: true, hasParking: false, hasBalcony: true,
      address: '12 Rue Didouche Mourad', city: 'Alger', postalCode: '16000', wilaya: 'Alger',
      monthlyRent: 35000, monthlyCharges: 3000, securityDeposit: 70000,
      description: 'Studio meuble lumineux avec vue sur mer', status: 'available',
    }),
    aptRepo.create({
      reference: 'APT-002', title: 'F3 Bab Ezzouar',
      propertyType: 'f3', surface: 75, rooms: 3, bedrooms: 2, bathrooms: 1,
      floor: 5, hasElevator: true, furnished: false, hasParking: true, hasBalcony: true,
      address: '45 Cite AADL', city: 'Alger', postalCode: '16040', wilaya: 'Alger',
      monthlyRent: 45000, monthlyCharges: 5000, securityDeposit: 90000,
      description: 'Appartement F3 avec parking et ascenseur', status: 'available',
    }),
    aptRepo.create({
      reference: 'APT-003', title: 'F4 Standing Oran',
      propertyType: 'f4', surface: 110, rooms: 4, bedrooms: 3, bathrooms: 2,
      floor: 2, hasElevator: false, furnished: false, hasParking: true, hasBalcony: true,
      address: '8 Boulevard Front de Mer', city: 'Oran', postalCode: '31000', wilaya: 'Oran',
      monthlyRent: 55000, monthlyCharges: 6000, securityDeposit: 110000,
      description: 'Grand F4 vue mer, quartier residentiel', status: 'available',
    }),
    aptRepo.create({
      reference: 'APT-004', title: 'Villa Tizi Ouzou',
      propertyType: 'villa', surface: 200, rooms: 6, bedrooms: 4, bathrooms: 2,
      floor: 0, hasElevator: false, furnished: false, hasParking: true, hasBalcony: true,
      address: '22 Rue des Oliviers', city: 'Tizi Ouzou', postalCode: '15000', wilaya: 'Tizi Ouzou',
      monthlyRent: 80000, monthlyCharges: 8000, securityDeposit: 160000,
      description: 'Villa avec jardin et garage', status: 'available',
    }),
    aptRepo.create({
      reference: 'APT-005', title: 'F2 Economique Setif',
      propertyType: 'f2', surface: 55, rooms: 2, bedrooms: 1, bathrooms: 1,
      floor: 1, hasElevator: false, furnished: true, hasParking: false, hasBalcony: false,
      address: '3 Cite 1000 Logements', city: 'Setif', postalCode: '19000', wilaya: 'Setif',
      monthlyRent: 25000, monthlyCharges: 2000, securityDeposit: 50000,
      description: 'F2 meuble ideal pour etudiant ou couple', status: 'available',
    }),
    aptRepo.create({
      reference: 'APT-006', title: 'Local Commercial Annaba',
      propertyType: 'local-commercial', surface: 90, rooms: 2, bedrooms: 0, bathrooms: 1,
      floor: 0, hasElevator: false, furnished: false, hasParking: false, hasBalcony: false,
      address: '15 Cours de la Revolution', city: 'Annaba', postalCode: '23000', wilaya: 'Annaba',
      monthlyRent: 60000, monthlyCharges: 4000, securityDeposit: 120000,
      description: 'Local commercial bien situe', status: 'available',
    }),
  ]);

  // 3 locataires
  const tnts = await Promise.all([
    tenRepo.create({
      firstName: 'Karim', lastName: 'Benali',
      phone: '0555123456', email: 'karim.benali@email.dz',
      profession: 'Ingenieur informatique', employer: 'Sonatrach',
      monthlyIncome: 120000, idType: 'cni', idNumber: '18234567890',
      emergencyContact: 'Fatima Benali', emergencyPhone: '0661234567',
      status: 'active',
    }),
    tenRepo.create({
      firstName: 'Amina', lastName: 'Boudiaf',
      phone: '0770234567', email: 'amina.boudiaf@email.dz',
      profession: 'Medecin', employer: 'CHU Mustapha',
      monthlyIncome: 150000, idType: 'cni', idNumber: '19876543210',
      emergencyContact: 'Rachid Boudiaf', emergencyPhone: '0552345678',
      status: 'active',
    }),
    tenRepo.create({
      firstName: 'Youcef', lastName: 'Djerrad',
      phone: '0660345678', email: 'youcef.djerrad@email.dz',
      profession: 'Enseignant universitaire', employer: 'Universite Setif 1',
      monthlyIncome: 90000, idType: 'passport', idNumber: 'DZ456789',
      status: 'active',
    }),
  ]);

  // 2 baux actifs
  const lse = await Promise.all([
    leaseRepo.create({
      leaseNumber: leaseRepo.generateLeaseNumber(),
      startDate: '2025-09-01', monthlyRent: 45000, monthlyCharges: 5000,
      securityDeposit: 90000, paymentDay: 1, paymentMethod: 'transfer',
      leaseType: 'residential', status: 'active',
      apartment: apts[1].id, tenant: tnts[0].id,
    }),
    leaseRepo.create({
      leaseNumber: leaseRepo.generateLeaseNumber(),
      startDate: '2025-11-01', monthlyRent: 25000, monthlyCharges: 2000,
      securityDeposit: 50000, paymentDay: 5, paymentMethod: 'ccp',
      leaseType: 'residential', status: 'active',
      apartment: apts[4].id, tenant: tnts[2].id,
    }),
  ]);

  // Marquer les appartements comme loues
  await Promise.all([
    aptRepo.markRented(apts[1].id),
    aptRepo.markRented(apts[4].id),
  ]);

  // Paiements — quelques mois pour chaque bail
  const months = ['2025-12', '2026-01', '2026-02', '2026-03'];
  for (const period of months) {
    const dueDate = `${period}-01`;
    // Bail 1 — Karim, 45000 DA
    await payRepo.create({
      period, amountDue: 50000, amountPaid: period <= '2026-01' ? 50000 : 0,
      dueDate, method: period <= '2026-01' ? 'transfer' : undefined,
      status: period <= '2026-01' ? 'paid' : (period === '2026-02' ? 'late' : 'pending'),
      paidAt: period <= '2026-01' ? `${period}-03` : undefined,
      daysLate: period === '2026-02' ? 28 : 0,
      lease: lse[0].id,
    });
    // Bail 2 — Youcef, 25000 DA
    await payRepo.create({
      period, amountDue: 27000, amountPaid: period <= '2026-02' ? 27000 : 0,
      dueDate: `${period}-05`, method: period <= '2026-02' ? 'ccp' : undefined,
      status: period <= '2026-02' ? 'paid' : 'pending',
      paidAt: period <= '2026-02' ? `${period}-05` : undefined,
      daysLate: 0,
      lease: lse[1].id,
    });
  }

  console.log(`Seed: ${apts.length} appartements, ${tnts.length} locataires, ${lse.length} baux, ${months.length * 2} paiements`);
}

main().catch(console.error);

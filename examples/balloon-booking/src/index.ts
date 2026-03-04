/**
 * Balloon Booking — Serveur Express + MostaORM
 *
 * Exemple de reservation de circuits en montgolfiere.
 * Demontre les RELATIONS entre entites via MostaORM :
 *   - Experience (types de vols)
 *   - Passenger  (clients)
 *   - Reservation (lie Passenger ↔ Experience)
 *   - Payment    (lie a une Reservation)
 *
 * Par defaut, utilise SQLite (zero configuration).
 * Pour changer de base de donnees :
 *   DB_DIALECT=mongodb   SGBD_URI=mongodb://localhost:27017/balloon   npm start
 *   DB_DIALECT=postgres  SGBD_URI=postgresql://user:pass@localhost/balloon  npm start
 *
 * Author: Dr Hamid MADANI <drmdh@msn.com>
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createConnection } from 'mostaorm';
import type { IDialect, DialectType } from 'mostaorm';

// Schemas des 4 entites
import { ExperienceSchema } from './entities/experience.schema.js';
import { PassengerSchema } from './entities/passenger.schema.js';
import { ReservationSchema } from './entities/reservation.schema.js';
import { PaymentSchema } from './entities/payment.schema.js';

// Routes
import { experienceRoutes } from './routes/experiences.js';
import { passengerRoutes } from './routes/passengers.js';
import { reservationRoutes } from './routes/reservations.js';
import { paymentRoutes } from './routes/payments.js';

// Repository pour le seed
import { ExperienceRepository } from './repositories/experience.repository.js';

// __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3001', 10);
const DB_DIALECT = (process.env.DB_DIALECT || 'sqlite') as DialectType;
const SGBD_URI = process.env.SGBD_URI || './balloon.db';

// ----------------------------------------------------------------
// Seed : 5 types d'experiences par defaut
// ----------------------------------------------------------------
async function seedExperiences(dialect: IDialect): Promise<void> {
  const repo = new ExperienceRepository(dialect);
  const count = await repo.count();

  // Ne seeder que si la table est vide
  if (count > 0) return;

  const experiences = [
    {
      name: 'Vol Classique',
      slug: 'vol-classique',
      description: 'Decouvrez la magie du vol en montgolfiere avec un panorama a couper le souffle. Vol paisible au-dessus des paysages avec un pilote experimente.',
      durationMinutes: 60,
      pricePerPerson: 8000,
      maxPassengers: 8,
      includes: 'Briefing securite, vol 1h, certificat de vol',
      category: 'standard' as const,
      sortOrder: 1,
    },
    {
      name: 'Cafe dans le Ciel',
      slug: 'cafe-dans-le-ciel',
      description: 'Savourez un cafe traditionnel algerien a 300m d\'altitude. Petit-dejeuner servi dans la nacelle avec vue panoramique.',
      durationMinutes: 90,
      pricePerPerson: 12000,
      maxPassengers: 6,
      includes: 'Cafe, viennoiseries, jus frais, vol 1h30',
      category: 'premium' as const,
      sortOrder: 2,
    },
    {
      name: 'Photographie Professionnelle',
      slug: 'photo-pro',
      description: 'Vol accompagne d\'un photographe professionnel. Repartez avec des photos et videos de qualite studio.',
      durationMinutes: 90,
      pricePerPerson: 15000,
      maxPassengers: 4,
      includes: 'Vol 1h30, photographe, 50 photos HD, video 3min',
      category: 'premium' as const,
      sortOrder: 3,
    },
    {
      name: 'Celebration',
      slug: 'celebration',
      description: 'Demande en mariage, anniversaire, khotba... Vivez un moment inoubliable dans les nuages. Decoration personnalisee de la nacelle.',
      durationMinutes: 120,
      pricePerPerson: 20000,
      maxPassengers: 4,
      includes: 'Vol 2h, decoration, gateau, champagne, photographe',
      category: 'celebration' as const,
      sortOrder: 4,
    },
    {
      name: 'VIP Sky Lounge',
      slug: 'vip-sky-lounge',
      description: 'L\'experience ultime. Vol prive en montgolfiere de luxe avec service premium complet. Le ciel n\'appartient qu\'a vous.',
      durationMinutes: 120,
      pricePerPerson: 35000,
      maxPassengers: 2,
      includes: 'Vol prive 2h, repas gastronomique, photographe, video drone, certificat VIP',
      category: 'vip' as const,
      sortOrder: 5,
    },
  ];

  for (const exp of experiences) {
    await repo.create(exp);
  }

  console.log(`[Seed] ${experiences.length} experiences creees`);
}

// ----------------------------------------------------------------
// Application Express
// ----------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ----------------------------------------------------------------
// Demarrage
// ----------------------------------------------------------------
async function start() {
  try {
    // 1. Connexion MostaORM avec les 4 schemas
    const dialect = await createConnection(
      {
        dialect: DB_DIALECT,
        uri: SGBD_URI,
        schemaStrategy: 'update',
      },
      [ExperienceSchema, PassengerSchema, ReservationSchema, PaymentSchema],
    );

    console.log(`[MostaORM] Connecte a ${DB_DIALECT} (${SGBD_URI})`);

    // 2. Seed des experiences par defaut
    await seedExperiences(dialect);

    // 3. Monter les routes
    app.use('/api/experiences', experienceRoutes(dialect));
    app.use('/api/passengers', passengerRoutes(dialect));
    app.use('/api/reservations', reservationRoutes(dialect));
    app.use('/api/payments', paymentRoutes(dialect));

    // 4. Route racine — frontend
    app.get('/', (_req, res) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // 5. Demarrer le serveur
    app.listen(PORT, () => {
      console.log(`\n  Balloon Booking`);
      console.log(`  ===============`);
      console.log(`  URL     : http://localhost:${PORT}`);
      console.log(`  Dialect : ${DB_DIALECT}`);
      console.log(`  URI     : ${SGBD_URI}`);
      console.log(`  Auteur  : Dr Hamid MADANI <drmdh@msn.com>\n`);
    });
  } catch (err) {
    console.error('Erreur au demarrage:', err);
    process.exit(1);
  }
}

start();

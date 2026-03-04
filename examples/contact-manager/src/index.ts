/**
 * Contact Manager — Serveur Express + MostaORM
 *
 * Exemple CRUD complet demonstrant l'utilisation de MostaORM
 * avec un projet Express.js simple.
 *
 * Par defaut, utilise SQLite (zero configuration).
 * Pour changer de base de donnees, definir les variables d'environnement :
 *
 *   DB_DIALECT=sqlite    SGBD_URI=./contacts.db                         (defaut)
 *   DB_DIALECT=mongodb   SGBD_URI=mongodb://localhost:27017/contacts
 *   DB_DIALECT=postgres  SGBD_URI=postgresql://user:pass@localhost:5432/contacts
 *   DB_DIALECT=mysql     SGBD_URI=mysql://user:pass@localhost:3306/contacts
 *
 * Author: Dr Hamid MADANI <drmdh@msn.com>
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createConnection } from 'mostaorm';
import type { DialectType } from 'mostaorm';
import { ContactSchema } from './entities/contact.schema.js';
import { contactRoutes } from './routes/contacts.js';

// __dirname equivalent en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_DIALECT = (process.env.DB_DIALECT || 'sqlite') as DialectType;
const SGBD_URI = process.env.SGBD_URI || './contacts.db';

// ----------------------------------------------------------------
// Application Express
// ----------------------------------------------------------------
const app = express();

// Middleware : parser le JSON dans les requetes POST/PUT
app.use(express.json());

// Middleware : servir les fichiers statiques (public/index.html)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ----------------------------------------------------------------
// Demarrage du serveur
// ----------------------------------------------------------------
async function start() {
  try {
    // 1. Connexion a la base de donnees via MostaORM
    //    - createConnection() connecte le dialecte et enregistre les schemas
    //    - schemaStrategy: 'update' cree/met a jour les tables automatiquement
    const dialect = await createConnection(
      {
        dialect: DB_DIALECT,
        uri: SGBD_URI,
        schemaStrategy: 'update',
      },
      [ContactSchema],
    );

    console.log(`[MostaORM] Connecte a ${DB_DIALECT} (${SGBD_URI})`);

    // 2. Monter les routes CRUD sur /api/contacts
    app.use('/api/contacts', contactRoutes(dialect));

    // 3. Route racine — servir le frontend
    app.get('/', (_req, res) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // 4. Demarrer le serveur HTTP
    app.listen(PORT, () => {
      console.log(`\n  Contact Manager`);
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

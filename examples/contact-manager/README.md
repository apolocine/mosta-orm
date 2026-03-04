# Contact Manager — Exemple MostaORM

> **Author** : Dr Hamid MADANI <drmdh@msn.com>
> Exemple CRUD complet (frontend + backend) utilisant MostaORM.

---

## Presentation

Ce projet est un gestionnaire de contacts minimaliste qui demontre
l'utilisation de **MostaORM** dans un projet Express.js.

**Fonctionnalites** :
- Tableau des contacts avec colonnes : Nom, Email, Telephone, Entreprise, Statut, Actions
- Actions CRUD : Ajouter, Modifier, Supprimer
- Recherche en temps reel
- Pagination
- Frontend responsive (Tailwind CSS)
- Backend Express.js avec 5 routes REST
- SQLite par defaut (zero configuration)

---

## Architecture

```
contact-manager/
  src/
    index.ts                    # Serveur Express + MostaORM init
    entities/
      contact.schema.ts         # Schema de l'entite Contact (EntitySchema)
    repositories/
      contact.repository.ts     # Repository type (BaseRepository<ContactDTO>)
    routes/
      contacts.ts               # 5 routes CRUD REST
  public/
    index.html                  # Frontend vanille JS + Tailwind CDN
  package.json
  tsconfig.json
```

### Flux de donnees

```
Frontend (index.html)
    |  fetch('/api/contacts')
    v
Routes Express (routes/contacts.ts)
    |  contactRepo.findAll() / create() / update() / delete()
    v
ContactRepository (repositories/contact.repository.ts)
    |  extends BaseRepository<ContactDTO>
    v
MostaORM Core (BaseRepository → IDialect)
    |
    v
Dialect actif (SQLite / MongoDB / PostgreSQL / MySQL / ...)
    |
    v
Base de Donnees
```

---

## Demarrage rapide

### 1. Installation

```bash
cd mostaorm/examples/contact-manager
npm install
```

### 2. Lancement (SQLite par defaut)

```bash
npm start
# → http://localhost:3000
```

Le fichier `contacts.db` est cree automatiquement dans le dossier courant.

### 3. Changer de base de donnees

```bash
# MongoDB
DB_DIALECT=mongodb SGBD_URI=mongodb://localhost:27017/contacts npm start

# PostgreSQL
DB_DIALECT=postgres SGBD_URI=postgresql://user:pass@localhost:5432/contacts npm start

# MySQL
DB_DIALECT=mysql SGBD_URI=mysql://user:pass@localhost:3306/contacts npm start
```

**Le meme code fonctionne sur tous les backends** — c'est le principe de MostaORM.

---

## API REST

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/contacts` | Liste avec recherche (`?q=`), statut (`?status=`), pagination (`?page=&limit=`) |
| GET | `/api/contacts/:id` | Detail d'un contact |
| POST | `/api/contacts` | Creer un contact |
| PUT | `/api/contacts/:id` | Modifier un contact |
| DELETE | `/api/contacts/:id` | Supprimer un contact |

### Exemples curl

```bash
# Lister tous les contacts
curl http://localhost:3000/api/contacts

# Rechercher
curl "http://localhost:3000/api/contacts?q=ahmed"

# Creer un contact
curl -X POST http://localhost:3000/api/contacts \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Ahmed","lastName":"Ben Ali","email":"ahmed@example.com"}'

# Modifier
curl -X PUT http://localhost:3000/api/contacts/ID_ICI \
  -H "Content-Type: application/json" \
  -d '{"phone":"0555123456"}'

# Supprimer
curl -X DELETE http://localhost:3000/api/contacts/ID_ICI
```

---

## Code source commente

Chaque fichier est entierement commente en francais :

- **contact.schema.ts** : Definit la structure de l'entite Contact (equivalent `@Entity` Hibernate)
- **contact.repository.ts** : Repository type avec methodes metier (equivalent `@Repository` Spring)
- **contacts.ts** : Routes Express REST documentees
- **index.ts** : Point d'entree serveur avec connexion MostaORM
- **index.html** : Frontend vanille JS avec commentaires detailles

---

## Concepts MostaORM illustres

| Concept | Fichier | Equivalent Hibernate |
|---------|---------|---------------------|
| `EntitySchema` | contact.schema.ts | `@Entity` / `@Table` |
| `BaseRepository<T>` | contact.repository.ts | `JpaRepository<T, ID>` |
| `createConnection()` | index.ts | `SessionFactory` |
| `FilterQuery` | contacts.ts (routes) | HQL / Criteria API |
| `QueryOptions` | contacts.ts (routes) | `setFirstResult()` / `setMaxResults()` |
| `normalizeDoc()` | automatique | ResultTransformer |

---

## Licence

MIT — Dr Hamid MADANI

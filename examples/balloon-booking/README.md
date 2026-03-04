# Balloon Booking — Exemple MostaORM avec Relations

> **Author** : Dr Hamid MADANI <drmdh@msn.com>
> Reservation de circuits en montgolfiere — Exemple multi-entites avec relations.

---

## Presentation

Ce projet demontre l'utilisation de **MostaORM** avec des **relations entre entites**
(equivalent JOINs SQL / populate MongoDB).

**4 entites avec relations** :

```
Experience (types de vols)  <──  Reservation  ──>  Passenger (client)
                                     |
                                     └──>  Payment
```

**Fonctionnalites** :
- Catalogue de 5 experiences : Vol Classique, Cafe dans le Ciel, Photo Pro, Celebration, VIP Sky Lounge
- Reservation avec choix de date, heure, nombre de places
- Calcul automatique du prix total
- Systeme de points de fidelite (10 pts / 1000 DA)
- Gestion des statuts : En attente → Confirmee → Terminee / Annulee / Reportee
- Paiement en ligne ou sur place
- Seed automatique des 5 experiences au premier lancement

---

## Architecture

```
balloon-booking/
  src/
    index.ts                          # Serveur Express + MostaORM + seed
    entities/
      experience.schema.ts            # Types de vols (standard, premium, celebration, vip)
      passenger.schema.ts             # Clients / passagers
      reservation.schema.ts           # Reservations (→ Experience, → Passenger)
      payment.schema.ts               # Paiements (→ Reservation)
    repositories/
      experience.repository.ts        # Catalogue + filtres par categorie
      passenger.repository.ts         # Recherche + points fidelite
      reservation.repository.ts       # CRUD + findWithRelations (JOINs)
      payment.repository.ts           # Paiements + calcul total
    routes/
      experiences.ts                  # 5 routes CRUD
      passengers.ts                   # 5 routes CRUD + recherche
      reservations.ts                 # 9 routes (CRUD + confirm/cancel/postpone/complete)
      payments.ts                     # 5 routes (CRUD + complete/refund)
  public/
    index.html                        # Frontend 3 vues (catalogue, reservations, passagers)
```

### Concepts MostaORM demontres

| Concept | Fichier | Description |
|---------|---------|-------------|
| **Relations** | reservation.schema.ts | `relations: { passenger: { target: 'Passenger', type: 'many-to-one' } }` |
| **findWithRelations** | reservation.repository.ts | JOINs automatiques cross-dialect |
| **Seed au demarrage** | index.ts | `seedExperiences()` avec `repo.count()` + `repo.create()` |
| **increment()** | passenger.repository.ts | Points de fidelite atomiques |
| **Filtres avances** | reservations.ts (routes) | Filtrage par statut, date |

---

## Demarrage

```bash
cd mostaorm/examples/balloon-booking
npm install
npm start
# → http://localhost:3001
```

### Changer de base de donnees

```bash
DB_DIALECT=mongodb SGBD_URI=mongodb://localhost:27017/balloon npm start
DB_DIALECT=postgres SGBD_URI=postgresql://user:pass@localhost/balloon npm start
```

---

## API REST

### Experiences

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/experiences` | Catalogue (filtrable: `?category=vip`) |
| GET | `/api/experiences/:id` | Detail |
| POST | `/api/experiences` | Creer |
| PUT | `/api/experiences/:id` | Modifier |
| DELETE | `/api/experiences/:id` | Supprimer |

### Passagers

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/passengers` | Liste (`?q=ahmed` pour rechercher) |
| GET | `/api/passengers/:id` | Detail |
| POST | `/api/passengers` | Creer |
| PUT | `/api/passengers/:id` | Modifier |
| DELETE | `/api/passengers/:id` | Supprimer |

### Reservations

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/reservations` | Liste avec relations (`?status=confirmed`) |
| GET | `/api/reservations/:id` | Detail avec passenger + experience |
| POST | `/api/reservations` | Creer (passengerId, experienceId, flightDate, timeSlot, seats, paymentMethod) |
| PUT | `/api/reservations/:id` | Modifier |
| PATCH | `/api/reservations/:id/confirm` | Confirmer |
| PATCH | `/api/reservations/:id/cancel` | Annuler |
| PATCH | `/api/reservations/:id/postpone` | Reporter (meteo) |
| PATCH | `/api/reservations/:id/complete` | Terminer + attribuer points |
| DELETE | `/api/reservations/:id` | Supprimer |

### Paiements

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/api/payments` | Liste |
| GET | `/api/payments/reservation/:resId` | Paiements d'une reservation |
| POST | `/api/payments` | Enregistrer (reservationId, amount, method) |
| PATCH | `/api/payments/:id/complete` | Marquer paye |
| PATCH | `/api/payments/:id/refund` | Rembourser |

---

## Licence

MIT — Dr Hamid MADANI

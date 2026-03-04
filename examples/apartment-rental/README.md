# Apartment Rental — Exemple MostaORM

Gestion locative complete : appartements, locataires, baux, paiements.
Inspire de Rentila, Ublo et Masteos.

**Author: Dr Hamid MADANI drmdh@msn.com**

## Entites

| Entite    | Relations                | Description                   |
|-----------|--------------------------|-------------------------------|
| Apartment | —                        | Bien immobilier (studio→villa)|
| Tenant    | —                        | Locataire                     |
| Lease     | → Apartment, → Tenant   | Bail locatif                  |
| Payment   | → Lease                  | Paiement de loyer mensuel     |

## Lancement

```bash
npm install
npm start          # http://localhost:3002
```

## API REST

### Appartements `/api/apartments`
- `GET /` — liste (filtres: `?status=`, `?city=`, `?search=`)
- `GET /:id` — detail
- `POST /` — creer
- `PUT /:id` — modifier
- `DELETE /:id` — supprimer
- `PATCH /:id/mark-rented` — marquer loue
- `PATCH /:id/mark-available` — marquer disponible

### Locataires `/api/tenants`
- `GET /` — liste (filtres: `?status=`, `?search=`)
- `GET /:id` — detail
- `POST /` — creer
- `PUT /:id` — modifier
- `DELETE /:id` — supprimer
- `PATCH /:id/mark-former` — marquer ancien

### Baux `/api/leases`
- `GET /` — liste avec relations (filtres: `?status=`, `?tenant=`)
- `GET /active` — baux actifs
- `GET /:id` — detail avec relations
- `POST /` — creer (leaseNumber auto-genere)
- `PUT /:id` — modifier
- `DELETE /:id` — supprimer
- `PATCH /:id/terminate` — resilier `{ reason }`
- `PATCH /:id/renew` — renouveler

### Paiements `/api/payments`
- `GET /` — liste (filtres: `?lease=`, `?status=`)
- `GET /totals/:leaseId` — totaux percu/impayes
- `GET /:id` — detail
- `POST /` — creer
- `PUT /:id` — modifier
- `DELETE /:id` — supprimer
- `PATCH /:id/mark-paid` — encaisser `{ amountPaid, method }`

### Dashboard `/api/dashboard`
- `GET /` — statistiques (occupation, revenus, impayes)

## Changement de dialect

```bash
DB_DIALECT=mongodb SGBD_URI=mongodb://localhost:27017/rental npm start
```

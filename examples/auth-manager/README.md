# Auth Manager — Exemple MostaORM

Systeme d'authentification securise : login, JWT, bcrypt, refresh tokens, audit trail.

**Author: Dr Hamid MADANI drmdh@msn.com**

## Securite implementee

- Hachage bcrypt (12 rounds) des mots de passe
- JWT access tokens (15 min) + refresh tokens (7 jours)
- Verrouillage du compte apres 5 tentatives echouees (15 min)
- Revocation des sessions
- Journal d'audit de chaque evenement
- Validation des mots de passe (min 8 caracteres)

## Entites

| Entite   | Description                                    |
|----------|------------------------------------------------|
| User     | email, username, passwordHash, role, status    |
| Session  | refreshToken, expiresAt, ipAddress → User      |
| AuditLog | action, success, details → User                |

## Lancement

```bash
npm install
npm start          # http://localhost:3003
```

## Comptes de demo

| Role  | Login   | Mot de passe |
|-------|---------|-------------|
| Admin | admin   | Admin123!   |
| User  | user    | User1234!   |

## API REST

### Auth `/api/auth`
- `POST /register` — inscription `{ email, username, password }`
- `POST /login` — connexion `{ login, password }` → `{ accessToken, refreshToken }`
- `POST /refresh` — renouveler le token `{ refreshToken }` → `{ accessToken }`
- `POST /logout` — deconnexion `{ refreshToken }` (auth requise)
- `GET /me` — profil (auth requise)
- `PUT /me/password` — changer mdp `{ currentPassword, newPassword }` (auth requise)
- `GET /sessions` — sessions actives (auth requise)
- `DELETE /sessions` — revoquer toutes les sessions (auth requise)

### Admin `/api/admin` (role admin requis)
- `GET /users` — liste des utilisateurs
- `PATCH /users/:id/role` — changer le role `{ role }`
- `PATCH /users/:id/ban` — bannir
- `PATCH /users/:id/unban` — debannir
- `GET /audit` — journal d'audit
- `GET /audit/failures` — echecs recents

## Changement de dialect

```bash
DB_DIALECT=mongodb SGBD_URI=mongodb://localhost:27017/authdb npm start
```

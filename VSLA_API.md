# How the VSLA API Works

## Overview

The VSLA (Village Savings and Loan Association) API is an optional module in FarmWallet Rice Shops that connects to an external VSL (Village Savings and Loans) database. It enables farmers, VSLA leaders, and VBAs (Village-Based Agents) to view their profile, groups, savings, and upcoming visits—and to make savings contributions via mobile money (MoMo).

---

## How the VSLA API “Awakens”

The VSLA API is **conditionally activated** at application startup. It does not connect to any database or load any models until the required environment variables are set.

### Activation Logic

1. **Configuration check** — On load, `src/models/vsl/index.js` reads the `vsl` config from `config/database.js`:
   - `VSL_DB_HOST` (required)
   - `VSL_DB_DATABASE` / `VSL_DB_NAME` (required)
   - `VSL_DB_USER` (required)
   - `VSL_DB_PASSWORD`
   - `VSL_DB_PORT` (default: 3306)
   - `VSL_DB_DIALECT` (default: mysql)

2. **Conditional connection** — If `VSL_DB_HOST`, `VSL_DB_DATABASE`, and `VSL_DB_USER` are all present, the module:
   - Creates a separate Sequelize instance for the VSL database
   - Loads all VSLA models (User, Group, GroupMembers, GroupWallet, SavingsContribution, VbaGroupAssignment, VbaVisit)
   - Sets up model associations
   - Exports `vslDb` with `isConfigured() === true`

3. **When not configured** — If any required variable is missing:
   - No database connection is made
   - All model references are `null`
   - `vslDb.isConfigured()` returns `false`
   - The API still responds at `/api/vsla` but returns `configured: false` and a message to configure `VSL_DB_*`

### Environment Variables

```env
VSL_DB_HOST=your-vsl-db-host
VSL_DB_PORT=3306
VSL_DB_NAME=your_vsla_database
VSL_DB_USER=your_user
VSL_DB_PASSWORD=your_password
VSL_DB_DIALECT=mysql
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FarmWallet Rice Shops                         │
├─────────────────────────────────────────────────────────────────┤
│  Primary DB (MySQL)          │  VSL DB (MySQL, optional)         │
│  - Exhibitors, Sales         │  - Users, Groups                  │
│  - Mechanization             │  - GroupMembers, GroupWallet      │
│  - Admin                     │  - SavingsContribution            │
│                              │  - VbaGroupAssignment, VbaVisit   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  VSLA API (/api/vsla)                                            │
│  - GET  /profile?phone=xxx                                       │
│  - GET  /profile/:phone/groups                                   │
│  - GET  /profile/:phone/savings                                  │
│  - GET  /profile/:phone/visits                                   │
│  - POST /contribute                                              │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Paystack (MoMo)                                                  │
│  - Charge for savings contributions                              │
│  - Webhook: charge.success → confirm contribution, update wallet │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/vsla` | None | Status check; returns `configured: true/false` and list of endpoints |
| GET | `/api/vsla/profile?phone=xxx` | API Key | User profile by phone |
| GET | `/api/vsla/profile/:phone/groups` | API Key | User's groups (membership or assigned for VBA) |
| GET | `/api/vsla/profile/:phone/savings` | API Key | Total savings per group |
| GET | `/api/vsla/profile/:phone/visits` | API Key | VBA's upcoming visits |
| POST | `/api/vsla/contribute` | API Key | Initiate savings contribution via MoMo |

### Authentication

All endpoints except `GET /api/vsla` require an API key:
- **Header:** `X-Api-Key: your-key`
- **Query (dev only):** `?api_key=your-key`

The key can be `VSLA_API_KEY` or `ADMIN_API_KEY` (fallback).

---

## Payment Flow (Savings Contribution)

1. **Client** calls `POST /api/vsla/contribute` with `{ phone, groupId, amount, momoProvider }`.
2. **API** looks up the user by phone in the VSL database.
3. **Service** creates a `SavingsContribution` with `status: 'pending'` and `reference: SAV-{timestamp}-{id}`.
4. **Paystack** charge is initiated; user receives MoMo prompt on their phone.
5. **User** completes payment on their device.
6. **Paystack webhook** receives `charge.success`:
   - Updates `SavingsContribution` to `status: 'confirmed'`
   - Increments `GroupWallet.mainBalance` by the contribution amount
7. **User** can see updated savings via `GET /api/vsla/profile/:phone/savings` or USSD.

---

## Integration with USSD

When the VSLA API is configured:

- **Main menu** shows option `6. VSLA - My Profile`.
- **Submenu** offers: My Profile, My Groups, My Savings, Make Contribution (farmers only).
- **Make Contribution** uses the same `vslaContributionService` as the API: select group → enter amount → select MoMo provider → Paystack charge.

---

## Group Shortcodes (USSD)

Each VSLA group can have a unique `group_code` (e.g. `01`, `02`) for direct USSD access:

- **`*920*72#`** — Main menu (option 6 for VSLA)
- **`*920*72*100#`** — Direct to VSLA Group (extensions 100+; members only)

Extensions are stored in `ussd_extensions` (FarmWallet DB). Run `npm run add-ussd-extensions` to create the table and populate from existing shops, providers, and groups. Each group gets a unique extension (100+).

---

## Summary

The VSLA API **awakens** when `VSL_DB_HOST`, `VSL_DB_NAME`, and `VSL_DB_USER` are set in the environment. It then connects to the external VSL database, loads models, and exposes read/write endpoints for profiles, groups, savings, visits, and MoMo-based contributions. When not configured, it remains dormant and returns a status message directing you to configure the database.

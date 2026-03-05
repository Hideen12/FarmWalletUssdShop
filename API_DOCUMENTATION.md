# FarmWallet Rice API Documentation

**Version:** 1.9  
**Base URL:** `http://your-domain:3000` or `https://your-domain:443` (HTTPS on 3443, mapped to 443)  
**Last updated:** March 5, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Reference](#quick-reference)
3. [Authentication](#authentication)
4. [Environment Variables](#environment-variables)
5. [Strong SSL/TLS Configuration](#strong-ssltls-configuration)
6. [Public Endpoints](#public-endpoints)
7. [USSD Endpoint](#ussd-endpoint)
8. [Exhibitor API (Shop Owner)](#exhibitor-api-shop-owner)
9. [Provider API](#provider-api-mechanization-service-provider-dashboard)
10. [Admin API](#admin-api)
11. [Mechanization Services API](#mechanization-services-api)
12. [VSLA API](#vsla-api)
13. [Paystack Webhook](#paystack-webhook)
14. [Error Responses](#error-responses)
15. [Data Models](#data-models)
16. [Web Dashboards](#web-dashboards) — see also [FRONTEND_API.md](FRONTEND_API.md) for frontend integration
17. [Scripts](#scripts)

---

## Overview

FarmWallet Rice is a USSD-based rice marketplace for shops in Ghana. Shop owners register with Ghana Card, create shops, and list rice types (with bag sizes 5–100 kg). Consumers browse shops and pay via **Paystack** mobile money (MTN, Vodafone, AirtelTigo). The app also offers **mechanization services** (tractor, plowing, threshing, purification, etc.) — pricing is per acre; farmers enter acres, total = price × acres; they contact providers directly.

| Endpoint Type | Auth | Description |
|---------------|------|-------------|
| Public | None | Health, root info |
| USSD | None | Africastalking/Arkesel callback |
| Exhibitor (Shop) | JWT (Bearer / Cookie) | Shop owner login, dashboard, logout |
| Provider | JWT (Bearer / Cookie) | Mechanization provider dashboard |
| Admin | JWT or API Key | Shop management, commission |
| Paystack Webhook | None | Payment status (charge.success, charge.failed) |

CORS is configurable via `CORS_ORIGIN` (comma-separated origins). Rate limits: API 100/15min, USSD 30/min, login 5/15min per IP. See [SECURITY.md](SECURITY.md) for details.

**Deployment:** HTTP on port 3000; HTTPS on port 3443 (map 443:3443 in Docker). Place SSL certs in `ssl/server.crt`, `ssl/server.key`, and optionally `ssl/server.ca-bundle`.

---

## Quick Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | — | Service info |
| GET | `/health` | — | Health check |
| GET | `/api` | — | API root |
| POST | `/ussd` | — | USSD callback |
| POST | `/api/exhibitor/login` | — | Shop owner login (returns JWT) |
| GET | `/api/exhibitor/dashboard` | JWT | Shop dashboard data |
| POST | `/api/exhibitor/inventory` | JWT | Add product to inventory |
| POST | `/api/exhibitor/logout` | — | Logout (clears cookie) |
| POST | `/api/provider/login` | — | Mechanization provider login (returns JWT) |
| GET | `/api/provider/dashboard` | JWT | Provider dashboard (services, transactions, earnings) |
| POST | `/api/provider/services` | JWT | Add tractor/service to provider |
| POST | `/api/provider/logout` | — | Provider logout |
| POST | `/api/admin/login` | — | Admin login (phone + password, returns JWT) |
| POST | `/api/admin/logout` | — | Admin logout |
| GET | `/api/admin/dashboard` | JWT or API Key | Admin summary stats |
| GET | `/api/admin/commission` | JWT or API Key | Commission summary with sales breakdown |
| GET | `/api/admin/users` | JWT or API Key | List admin users |
| POST | `/api/admin/users` | JWT or API Key | Create admin user |
| GET | `/api/admin/inventory` | JWT or API Key | List products (filter by status) |
| PATCH | `/api/admin/inventory/:id` | JWT or API Key | Set verification_status (verified/rejected) |
| PATCH | `/api/admin/inventory/:id/verify` | JWT or API Key | Legacy: set verified (true/false) |
| GET | `/api/admin/exhibitors` | JWT or API Key | List shops |
| GET | `/api/admin/exhibitors/:id` | JWT or API Key | Shop details |
| PATCH | `/api/admin/exhibitors/:id` | JWT or API Key | Update shop |
| DELETE | `/api/admin/exhibitors/:id` | JWT or API Key | Deactivate shop |
| GET | `/api/admin/data-submissions` | JWT or API Key | List/export data submissions (format=csv or json) |
| POST | `/api/admin/data-submissions/import` | JWT or API Key | Import data submissions from CSV file |
| GET | `/api/admin/mechanization/providers` | JWT or API Key | List mechanization providers |
| POST | `/api/admin/mechanization/providers` | JWT or API Key | Create mechanization provider |
| GET | `/api/admin/mechanization/providers/:id` | JWT or API Key | Provider details with services |
| PATCH | `/api/admin/mechanization/providers/:id` | JWT or API Key | Update provider |
| POST | `/api/admin/mechanization/providers/:id/services` | JWT or API Key | Add service to provider |
| GET | `/api/admin/mechanization/services` | JWT or API Key | List services (query: status, provider_id) |
| PATCH | `/api/admin/mechanization/services/:id` | JWT or API Key | Update service or set verification_status (verified/rejected) |
| GET | `/api/admin/mechanization/transactions` | JWT or API Key | List mechanization transactions |
| POST | `/api/admin/mechanization/transactions` | JWT or API Key | Record transaction (10% commission) |
| GET | `/api/commission` | API Key | Commission summary |
| GET | `/api/vsla` | — | VSLA API info (configured status) |
| GET | `/api/vsla/profile?phone=xxx` | API Key | VSLA user profile by phone |
| GET | `/api/vsla/profile/:phone/groups` | API Key | User's groups (membership or assigned) |
| GET | `/api/vsla/profile/:phone/savings` | API Key | User's savings contributions per group |
| GET | `/api/vsla/profile/:phone/visits` | API Key | VBA's upcoming scheduled visits |
| POST | `/api/vsla/contribute` | API Key | Initiate savings contribution via MoMo |
| POST | `/api/paystack/webhook` | — | Paystack webhook (charge.success, charge.failed) |

---

## Authentication

### Admin (JWT or API Key)

Admin endpoints accept either:

**Option 1 — Phone + password (dashboard):**
1. `POST /api/admin/login` with `{ phone, password }` → returns JWT
2. Use `Authorization: Bearer <jwt>` or cookie `admin_token` for subsequent requests

**Option 2 — API key (programmatic):**
- **Header:** `X-Api-Key: your-api-key`
- **Query:** `?api_key=your-api-key` (development only; disabled in production for security)

**Create admin users:**
```bash
npm run create-admin
# With env vars:
ADMIN_PHONE=0555227753 ADMIN_PASSWORD=yourpassword npm run create-admin
# Or positional args:
node scripts/create-admin.js 0555227753 yourpassword
```

### Exhibitor JWT

Exhibitor dashboard endpoints require a JWT from `/api/exhibitor/login`. Provide via:

- **Header:** `Authorization: Bearer <jwt>`
- **Cookie:** `exhibitor_token` (set automatically on login)
- **Query:** `?token=<jwt>` (development only; disabled in production for security)

JWT expires in 24 hours (configurable via `JWT_EXPIRES_IN`). **JWT_SECRET is required in production** (min 32 chars); app exits if not set.

### Provider JWT

Mechanization provider dashboard endpoints require a JWT from `POST /api/provider/login`. Provide via:

- **Header:** `Authorization: Bearer <jwt>`
- **Cookie:** `provider_token` (set automatically on login)
- **Query:** `?token=<jwt>` (development only; disabled in production for security)

**Register provider with PIN:**
```bash
npm run register-provider
# Or: node scripts/register-provider.js [phone] [pin]
# Default: phone=0244111001, pin=1234
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Yes | MySQL connection |
| `JWT_SECRET` | Yes* | JWT signing secret (min 32 chars). **Required in production**; app exits if unset. |
| `JWT_EXPIRES_IN` | No | JWT expiry (default: `24h`) |
| `ADMIN_API_KEY` | Yes** | API key for `/api/commission` and programmatic admin access. **Required** for commission endpoint. |
| `FARMWALLET_COMMISSION_PERCENT` | No | Rice commission % (default: 2) |
| `MECHANIZATION_COMMISSION_PERCENT` | No | Tractor service commission % (default: 10) |
| `COMMISSION_BANK_NAME` | No | Bank name for commission deposits (default: Absa Bank) |
| `COMMISSION_BANK_ACCOUNT` | No | Bank account number for commission deposits (default: 0851116494) |
| `CORS_ORIGIN` | No | Comma-separated allowed origins (e.g. `https://admin.example.com`). Empty = same-origin. |
| `SSL_CERT_PATH`, `SSL_KEY_PATH`, `SSL_CA_PATH` | No | Paths to SSL cert, key, and CA bundle for HTTPS. Default: `ssl/server.crt`, `ssl/server.key`, `ssl/server.ca-bundle`. |
| `HTTPS_PORT` | No | HTTPS port inside container (default: 3443). Map 443:3443 in Docker. |
| `TLS_MIN_VERSION` | No | Minimum TLS version: `TLSv1.2` (default) or `TLSv1.3` for strongest security. |
| `PAYSTACK_SECRET_KEY` | No* | Paystack secret key for payments. Omit for mock mode. |
| `PAYSTACK_WEBHOOK_SECRET` | No | Optional: for webhook signature verification |
| `PAYSTACK_CALLBACK_URL` | No | Optional: base URL (defaults to `MTN_CALLBACK_URL` if set) |
| `ARKESEL_API_KEY` | No | SMS (Arkesel) for USSD |
| `VSL_DB_HOST`, `VSL_DB_PORT`, `VSL_DB_NAME`, `VSL_DB_USER`, `VSL_DB_PASSWORD`, `VSL_DB_DIALECT` | No | External VSL/VSLA database. When set, USSD shows "6. VSLA - My Profile" and VSLA API is available. |
| `VSLA_API_KEY` | No | API key for VSLA endpoints. Falls back to `ADMIN_API_KEY` if not set. |

---

## Strong SSL/TLS Configuration

The backend uses strong TLS by default when HTTPS is enabled. Configure as follows:

### 1. Certificate files

Place your certificates in the `ssl/` directory (or set env paths):

| File | Env variable | Description |
|------|--------------|-------------|
| `ssl/server.crt` | `SSL_CERT_PATH` | Server certificate |
| `ssl/server.key` | `SSL_KEY_PATH` | Private key (keep secret) |
| `ssl/server.ca-bundle` | `SSL_CA_PATH` | CA/intermediate chain (optional) |

### 2. Certificate sources

- **Let's Encrypt (free):** Use Certbot or acme.sh. Example with Certbot:
  ```bash
  certbot certonly --standalone -d your-domain.com
  # Certs in /etc/letsencrypt/live/your-domain.com/
  # Symlink or copy fullchain.pem → ssl/server.crt, privkey.pem → ssl/server.key
  ```
- **Commercial CA:** Purchase from DigiCert, Sectigo, etc. Use the issued cert and key.
- **Self-signed (dev only):** `openssl req -x509 -nodes -days 365 -newkey rsa:4096 -keyout ssl/server.key -out ssl/server.crt`

### 3. Strong TLS settings (built-in)

The server enforces:

- **TLS 1.2 minimum** (configurable via `TLS_MIN_VERSION=TLSv1.3` for TLS 1.3 only)
- **TLS 1.3** supported
- **Secure ciphers only:** AES-256-GCM, ChaCha20-Poly1305, ECDHE key exchange
- **Honor cipher order:** Server preference (strongest first)

### 4. Environment variables

```env
SSL_CERT_PATH=/path/to/server.crt
SSL_KEY_PATH=/path/to/server.key
SSL_CA_PATH=/path/to/ca-bundle.crt   # optional
HTTPS_PORT=3443
TLS_MIN_VERSION=TLSv1.2   # or TLSv1.3 for strictest
```

### 5. Reverse proxy (recommended for production)

For production, use **Nginx** or **Caddy** in front of the Node app:

- Terminate SSL at the proxy (handles cert renewal, OCSP stapling)
- Proxy to Node over HTTP (localhost) or a separate TLS connection
- Nginx example: `ssl_protocols TLSv1.2 TLSv1.3; ssl_prefer_server_ciphers on; ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:...`

---

## Public Endpoints

### GET /

Service info and available endpoints.

**Response:**
```json
{
  "status": "ok",
  "service": "FarmWallet Rice Shops"
}
```

---

### GET /health

Health check.

**Response:**
```json
{
  "status": "ok"
}
```

---

### GET /api

API root. Base path for all API routes.

**Response:**
```json
{
  "message": "FarmWallet Rice Shops API",
  "version": "1.0"
}
```

---

## USSD Endpoint

### POST /ussd

USSD callback for Africastalking or Arkesel. Called when users dial the shortcode.

**Shortcodes:**
- `*920*72#` — Main menu
- `*920*72*01#` — Direct to Shop 01 (rice)
- `*920*72*50#` — Direct to Mechanization Provider (extensions 50-99)
- `*920*72*100#` — Direct to VSLA Group (extensions 100+; contribute)

**USSD Extension Ranges (system-generated):**

| Entity | Range | How assigned |
|--------|-------|---------------|
| Shops | 01–49 | Uses `shop_id` when shop is created |
| Providers | 50–99 | Auto-assigned on create; not user-editable |
| VSLA Groups | 100+ | Assigned by `add-ussd-extensions` script |

**Note:** `GET /ussd` returns `405 Method Not Allowed` with usage instructions.

**Content-Type:** `application/x-www-form-urlencoded` or `application/json`

#### Africastalking Format

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sessionId | string | Yes | Unique session ID |
| phoneNumber | string | Yes | User phone (e.g. 233555227753) |
| text | string | No | User input (empty on first request) |
| serviceCode | string | Yes | Shortcode (e.g. *920*72#) |

**Example Request:**
```
POST /ussd
Content-Type: application/x-www-form-urlencoded

sessionId=abc123&phoneNumber=233555227753&text=1&serviceCode=*920*72#
```

#### Arkesel Format

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sessionID | string | Yes | Unique session ID |
| msisdn | string | Yes | User phone |
| userData | string | No | User input |
| newSession | boolean | Yes | True if new session |

**Response Format (Africastalking):**
- `CON <text>` — Continue session (show menu)
- `END <text>` — End session

**Response Format (Arkesel):**
- `response` field with `CON` or `END` prefix

#### USSD Menu Flow

| Option | Flow |
|--------|------|
| 1 | Register as Shop (Ghana Card) |
| 2 | Browse Shops & Buy Rice (select shop → select rice → enter quantity → select MoMo provider → pay) |
| 3 | Shop Owner — Manage My Shop (PIN, add rice: type → bag size → qty → price) |
| 4 | Mechanization Services (select type → select provider → enter acres → see total & contact) |
| 5 | Share your info (name, region, interest, farm size — no registration) |
| 6 | VSLA - My Profile *(only when VSL DB configured)* — Look up user by phone; shows name, type, status |
| 0 | Exit |

**Rice:** Bag sizes 5, 25, 50, 100 kg. Shop owners choose size when adding inventory.

**Mechanization:** Per-acre pricing. Farmer enters acres; total = price × acres. Example: 5 acres × GHS 250/acre = GHS 1,250. Services may include tractor registration number (shown in USSD as "Reg: XXX"). Each provider has a unique extension under *920*72# (e.g. Provider → `*920*72*50#`).

#### USSD Session Persistence & Resume

Africa's Talking session timeout is ~30–60 seconds (telco-controlled). Sessions are persisted to MySQL (`ussd_sessions` table) so:

- **Server restarts** — Sessions survive; state is restored from DB
- **Session timeout** — When user dials again after timeout, they see: "Session timed out. Continue where you left off? 1. Yes 2. No"
- **Resumable flows** — Shop registration, shop selection, manage shop (add inventory)

Run `npm run add-ussd-sessions` to create the `ussd_sessions` table. Sessions expire after 30 minutes of inactivity.

#### Share your info (Option 5)

Collects user data without registration. Flow: name → region (1–9) → interest (farmer/buyer/both/browsing) → farm size (acres). Data stored in `data_submissions` table. Export via `GET /api/admin/data-submissions?format=csv`.

---

## Exhibitor API (Shop Owner)

The Exhibitor API is used by shop owners. Endpoints are under `/api/exhibitor/` for backward compatibility.

### POST /api/exhibitor/login

Log in with phone and 4-digit PIN. PIN must be set via USSD "Manage My Shop" (option 3) first.

**Content-Type:** `application/json`

**Request:**
```json
{
  "phone": "0555227753",
  "pin": "1234"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Phone (digits only, e.g. 0555227753 or 233555227753) |
| pin | string | Yes | 4-digit PIN |

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "exhibitor": {
    "id": 1,
    "shop_id": "01",
    "name": "John's Rice Shop"
  }
}
```

The `token` is a JWT. Include it as `Authorization: Bearer <token>` for protected endpoints.

**Error Responses:**
- `400` — Phone and 4-digit PIN required
- `401` — Shop not found, inactive, PIN not set, or invalid PIN

---

### GET /api/exhibitor/dashboard

Get shop owner's stats, inventory, and recent sales. Requires JWT authentication.

**Headers:** `Authorization: Bearer <jwt>` or cookie `exhibitor_token`

**Success Response (200):**
```json
{
  "exhibitor": {
    "id": 1,
    "shop_id": "01",
    "name": "John's Rice Shop",
    "phone": "233555227753",
    "momo_number": "233555227753",
    "momo_provider": "mtn",
    "is_active": true,
    "ExhibitorInventories": [
      {
        "id": 1,
        "rice_type": "perfumed",
        "bag_size_kg": 50,
        "quantity": 50,
        "price_per_bag": 120.00,
        "verification_status": "verified"
      }
    ]
  },
  "stats": {
    "total_sales": "1500.00",
    "total_commission": "30.00",
    "sale_count": 5,
    "commission_percent": 2
  },
  "recent_sales": [
    {
      "id": 10,
      "quantity": 2,
      "amount": 240.00,
      "momo_status": "completed",
      "buyer_phone": "233244123456",
      "rice_type": "perfumed",
      "created_at": "2025-02-28T10:00:00.000Z"
    }
  ]
}
```

**Note:** `exhibition_day` may still appear in responses for legacy compatibility but is no longer used for filtering.

**Error Responses:**
- `401` — Login required
- `404` — Shop not found

---

### POST /api/exhibitor/inventory

Add a product to the shop's inventory. Requires JWT authentication. New products start with `verification_status: pending` until admin verifies.

**Headers:** `Authorization: Bearer <jwt>` or cookie `exhibitor_token`

**Request:**
```json
{
  "rice_type": "perfumed",
  "bag_size_kg": 50,
  "quantity": 50,
  "price_per_bag": 120.00
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| rice_type | string | Yes | One of: perfumed, brown, parboiled, jasmine, basmati, other |
| bag_size_kg | integer | Yes | Bag size: 5, 25, 50, or 100 |
| quantity | integer | Yes | Number of bags (≥1) |
| price_per_bag | number | Yes | Price per bag in GHS (>0) |

**Success Response (201):**
```json
{
  "message": "Product added. Pending admin verification.",
  "item": {
    "id": 5,
    "rice_type": "perfumed",
    "bag_size_kg": 50,
    "quantity": 50,
    "price_per_bag": 120.00,
    "verification_status": "pending"
  }
}
```

**Error Responses:**
- `400` — Invalid rice_type, bag_size_kg, quantity, or price_per_bag
- `401` — Login required
- `404` — Shop not found or inactive

---

### POST /api/exhibitor/logout

Log out. Clears the cookie; client should discard the JWT.

**Success Response (200):**
```json
{
  "message": "Logged out"
}
```

---

## Provider API (Mechanization Service Provider Dashboard)

Provider endpoints require JWT from `POST /api/provider/login`. Use `Authorization: Bearer <jwt>` or cookie `provider_token`.

### POST /api/provider/login

Log in with phone and 4-digit PIN. Returns JWT for dashboard access.

**Request:**
```json
{
  "phone": "0244111001",
  "pin": "1234"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Provider phone (e.g. 0244111001 or 233244111001) |
| pin | string | Yes | 4-digit PIN (set via `npm run register-provider`) |

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "provider": {
    "id": 1,
    "name": "Northern Tractors",
    "region": "Northern"
  }
}
```

**Error Responses:**
- `400` — Phone and 4-digit PIN required
- `401` — Provider not found, inactive, PIN not set, or invalid PIN

---

### GET /api/provider/dashboard

Get provider's services, transactions, and earnings summary. Requires JWT.

**Success Response (200):**
```json
{
  "provider": {
    "id": 1,
    "name": "Northern Tractors",
    "phone": "233244111001",
    "region": "Northern",
    "MechanizationServices": [
      {
        "id": 1,
        "service_type": "tractor",
        "price_per_unit": 100.00,
        "unit": "per_acre",
        "tractor_registration_number": "TRC-01-01"
      }
    ]
  },
  "stats": {
    "total_amount": "1500.00",
    "total_commission": "150.00",
    "net_earnings": "1350.00",
    "transaction_count": 5
  },
  "recent_transactions": [
    {
      "id": 1,
      "amount": 300.00,
      "farmwallet_commission": 30.00,
      "farmer_phone": "233244123456",
      "service_type": "tractor",
      "created_at": "2025-02-28T10:00:00.000Z"
    }
  ]
}
```

**Error Responses:**
- `401` — Login required
- `404` — Provider not found

---

### POST /api/provider/services

Add a tractor or equipment service to the provider's offerings. Requires JWT.

**Headers:** `Authorization: Bearer <jwt>` or cookie `provider_token`

**Request:**
```json
{
  "service_type": "tractor",
  "tractor_registration_number": "TRC-01-001",
  "price_per_unit": 100.00,
  "unit": "per_acre",
  "description": "John Deere 5055E"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| service_type | string | Yes | One of: tractor, plowing, threshing, harvesting, seed_drill, irrigation, sprayer, purification, other |
| tractor_registration_number | string | Yes | Official registration number (for tracking earnings and commission) |
| price_per_unit | number | Yes | Price in GHS (≥0) |
| unit | string | No | per_acre (default), per_hour, per_day, or per_job |
| description | string | No | Optional description (e.g. equipment model) |

**Success Response (201):**
```json
{
  "message": "Tractor/service added successfully",
  "service": {
    "id": 5,
    "service_type": "tractor",
    "tractor_registration_number": "TRC-01-001",
    "price_per_unit": 100.00,
    "unit": "per_acre",
    "is_active": true
  }
}
```

**Error Responses:**
- `400` — Invalid service_type, missing tractor_registration_number, or invalid price_per_unit
- `401` — Login required
- `404` — Provider not found or inactive

---

### POST /api/provider/logout

Log out. Clears the cookie.

**Success Response (200):**
```json
{
  "message": "Logged out"
}
```

---

## Admin API

Admin endpoints accept JWT (from `POST /api/admin/login`) or API key (`X-Api-Key` / `api_key`).

### POST /api/admin/login

Log in with phone and password. Returns JWT for dashboard access.

**Content-Type:** `application/json`

**Request:**
```json
{
  "phone": "0555227753",
  "password": "yourpassword"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Phone (e.g. 0555227753 or 233555227753) |
| password | string | Yes | Password (min 6 characters) |

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin": { "id": 1, "phone": "233555227753", "name": "Admin" }
}
```

**Error Responses:**
- `400` — Phone and password (min 6 chars) required
- `401` — Invalid phone or password

---

### POST /api/admin/logout

Log out. Clears the `admin_token` cookie.

**Success Response (200):**
```json
{ "message": "Logged out" }
```

---

### GET /api/admin/users

List all admin users (excludes password hash).

**Success Response (200):**
```json
{
  "admins": [
    {
      "id": 1,
      "phone": "233555227753",
      "name": "Admin",
      "is_active": true,
      "created_at": "2025-02-28T00:00:00.000Z"
    }
  ]
}
```

---

### POST /api/admin/users

Create a new admin user.

**Content-Type:** `application/json`

**Request:**
```json
{
  "phone": "0555227753",
  "password": "securepassword",
  "name": "Admin Name"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Phone number |
| password | string | Yes | Password (min 6 characters) |
| name | string | No | Display name |

**Success Response (201):** Created admin object (excludes `password_hash`)

**Error Responses:**
- `400` — Phone and password (min 6 chars) required
- `409` — Admin with this phone already exists

---

### GET /api/admin/inventory

List products (inventory). Only products with `verification_status === 'verified'` appear in the USSD marketplace.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter: `pending`, `verified`, `rejected` |
| exhibitor_id | number | Filter by exhibitor |
| page | number | Page number |
| limit | number | Items per page (max 100) |

**Success Response (200):**
```json
{
  "items": [
    {
      "id": 1,
      "exhibitor_id": 1,
      "rice_type": "perfumed",
      "bag_size_kg": 50,
      "quantity": 50,
      "price_per_bag": 120.00,
      "verification_status": "pending",
      "exhibitor_name": "John's Rice Shop",
      "shop_id": "01"
    }
  ],
  "inventory": [ "..." ],
  "pagination": { "page": 1, "limit": 50, "total": 10 }
}
```

**Note:** Response includes both `items` and `inventory` (identical arrays) for compatibility.

---

### PATCH /api/admin/inventory/:id

Update product verification status.

**Request:**
```json
{ "verification_status": "verified" }
```
or
```json
{ "verification_status": "rejected" }
```

**Success Response (200):** Updated inventory item (includes `exhibitor_name`, `shop_id`)

**Error Responses:**
- `400` — verification_status must be verified or rejected
- `404` — Product not found

---

### PATCH /api/admin/inventory/:id/verify

Legacy endpoint. Update product verification status using boolean `verified`.

**Request:**
```json
{ "verified": true }
```
or
```json
{ "verified": false }
```

- `verified: true` → sets `verification_status` to `verified`
- `verified: false` → sets `verification_status` to `rejected`

**Success Response (200):** Updated inventory item (includes `exhibitor_name`, `shop_id`)

**Error Responses:**
- `404` — Product not found

---

**Error Responses (all protected Admin endpoints):**
- `401` — Unauthorized (invalid or missing JWT / API key)
- `503` — When using API key: `ADMIN_API_KEY` not set (use phone + password login instead)

### GET /api/admin/dashboard

Summary statistics for admin. Includes rice sales and mechanization (tractor services) with 10% commission.

**Success Response (200):**
```json
{
  "exhibitors": {
    "total": 25,
    "active": 23
  },
  "sales": {
    "total_amount": "45000.00",
    "total_commission": "900.00",
    "count": 180
  },
  "mechanization": {
    "total_amount": "1250.00",
    "total_commission": "125.00",
    "count": 5,
    "commission_percent": 10
  }
}
```

**Note:** `exhibitors` represents shops. All active shops are shown regardless of day.

---

### GET /api/admin/commission

Commission summary with sales breakdown. Accepts JWT (admin login) or API key.

**Query Parameters:** `start`, `end` (ISO dates)

**Success Response (200):**
```json
{
  "period": { "start": "all", "end": "all" },
  "total_sales": "940.00",
  "total_commission": "18.80",
  "commission_deposit": {
    "bank_name": "Absa Bank",
    "account_number": "0851116494"
  },
  "commission_percent": "2",
  "count": 3,
  "sales": [
    { "id": 1, "shop": "John's Rice Shop", "shop_id": "01", "amount": 240, "commission": 4.8, "created_at": "..." }
  ]
}
```

`commission_deposit` shows where to deposit commission (from `COMMISSION_BANK_NAME` and `COMMISSION_BANK_ACCOUNT` env vars).

---

### GET /api/admin/exhibitors

List shops (exhibitors) with optional filters and pagination. All active shops are shown by default.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| day | number | - | Optional legacy filter by exhibition_day (1, 2, 3). Omit to show all shops. |
| active | boolean | - | Filter by is_active (true/false) |
| search | string | - | Search name, phone, or shop_id |

**Example:** `GET /api/admin/exhibitors?page=1&limit=10&search=john&active=true`

**Success Response (200):**
```json
{
  "exhibitors": [
    {
      "id": 1,
      "shop_id": "01",
      "ghana_card": "GHA-123-456",
      "name": "John's Rice Shop",
      "phone": "233555227753",
      "momo_number": "233555227753",
      "momo_provider": "mtn",
      "exhibition_day": 1,
      "is_active": true,
      "created_at": "2025-02-01T00:00:00.000Z",
      "updated_at": "2025-02-28T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}
```

---

### GET /api/admin/exhibitors/:id

Get shop details with inventory and sales summary.

**Success Response (200):**
```json
{
  "id": 1,
  "shop_id": "01",
  "ghana_card": "GHA-123-456",
  "name": "John's Rice Shop",
  "phone": "233555227753",
  "momo_number": "233555227753",
  "momo_provider": "mtn",
  "exhibition_day": 1,
  "is_active": true,
  "ExhibitorInventories": [
    {
      "id": 1,
      "rice_type": "perfumed",
      "bag_size_kg": 50,
      "quantity": 50,
      "price_per_bag": 120.00,
      "verification_status": "verified"
    }
  ],
  "recent_sales": [
    {
      "id": 10,
      "quantity": 2,
      "amount": 240.00,
      "momo_status": "completed",
      "created_at": "2025-02-28T10:00:00.000Z"
    }
  ],
  "sales_summary": {
    "total_sales": 1500,
    "total_commission": 30,
    "sale_count": 5
  }
}
```

**Note:** `total_sales` and `total_commission` may be returned as numbers or strings depending on the database driver.

**Error Responses:**
- `404` — Shop not found

---

### PATCH /api/admin/exhibitors/:id

Update shop. Only provided fields are updated.

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "is_active": true,
  "name": "Updated Shop Name",
  "momo_number": "233555227753",
  "momo_provider": "mtn"
}
```

| Field | Type | Description |
|-------|------|-------------|
| is_active | boolean | Active status |
| name | string | Shop name |
| exhibition_day | number | Legacy: 1, 2, or 3 (kept for DB compatibility) |
| momo_number | string | MoMo phone number |
| momo_provider | string | `mtn`, `vodafone`, or `airteltigo` |

**Success Response (200):** Updated shop object (excludes `pin_hash`)

**Error Responses:**
- `404` — Shop not found

---

### DELETE /api/admin/exhibitors/:id

Deactivate shop (soft delete). Sets `is_active` to `false`.

**Success Response (200):**
```json
{
  "message": "Exhibitor deactivated",
  "shop_id": "01"
}
```

**Error Responses:**
- `404` — Shop not found

---

### GET /api/admin/data-submissions

List or export data submissions collected via USSD "Share your info" (option 5). No registration required — collects name, region, interest, farm size.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | `json` | `csv` or `json` — CSV triggers download |
| type | string | — | Filter by `submission_type` (e.g. `user_info`) |
| start | string | — | ISO date (inclusive) — filter by `created_at` |
| end | string | — | ISO date (inclusive) — filter by `created_at` |
| page | number | 1 | Page number (JSON only) |
| limit | number | 500 | Items per page (JSON: max 1000; CSV: up to 10000) |

**Success Response (200) — JSON:**
```json
{
  "submissions": [
    {
      "id": 1,
      "phone_number": "233555227753",
      "submission_type": "user_info",
      "data": {
        "name": "John Doe",
        "region": "Ashanti",
        "interest": "farmer",
        "farm_size_acres": "5"
      },
      "source": "ussd",
      "created_at": "2025-03-01T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Success Response (200) — CSV:**

Returns `text/csv` with `Content-Disposition: attachment; filename="data-submissions-YYYY-MM-DD.csv"`. Columns: `id`, `phone_number`, `submission_type`, `name`, `region`, `interest`, `farm_size_acres`, `source`, `created_at`.

**DataSubmission model / table:**

| Column | Type | Description |
|--------|------|-------------|
| id | int | Primary key |
| phone_number | string | User phone |
| submission_type | string | `user_info`, `farmer_survey`, etc. |
| data | JSON | Flexible fields: name, region, interest, farm_size_acres |
| source | string | `ussd`, `web`, `manual` |
| created_at, updated_at | datetime | Timestamps |

**Migration:** Run `npm run add-data-submissions` to create the `data_submissions` table.

---

### POST /api/admin/data-submissions/import

Import data submissions from a CSV file. Admin UI: Data Submissions → Import CSV.

**Content-Type:** `multipart/form-data`

**Request:** Form field `file` — CSV file. Expected columns:

| Column | Required | Description |
|--------|----------|-------------|
| phone_number | Yes | User phone (0555227753 or 233555227753) |
| name | No | User name |
| region | No | Region |
| interest | No | farmer, buyer, both, browsing |
| farm_size_acres | No | Farm size in acres |
| submission_type | No | Default `user_info` |
| source | No | Default `manual` |

**Success Response (201):**
```json
{
  "imported": 5,
  "errors": [],
  "message": "Imported 5 row(s)"
}
```

**Error Responses:**
- `400` — No file uploaded, or CSV empty
- `500` — Server error

---

### GET /api/commission

Commission summary. **Requires ADMIN_API_KEY** (set in env). Use `X-Api-Key` header or `api_key` query (query disabled in production). Returns 503 if `ADMIN_API_KEY` not configured.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| start | string | ISO date (inclusive) |
| end | string | ISO date (inclusive) |

**Example:** `GET /api/commission?start=2025-02-01&end=2025-02-28`

**Success Response (200):**
```json
{
  "period": {
    "start": "2025-02-01",
    "end": "2025-02-28"
  },
  "total_sales": "45000.00",
  "total_commission": "900.00",
  "commission_percent": "2",
  "count": 180,
  "sales": [
    {
      "id": 1,
      "shop": "John's Rice Shop",
      "amount": 240,
      "commission": 4.8,
      "created_at": "2025-02-28T10:00:00.000Z"
    }
  ]
}
```

---

## Mechanization Services API

Farm equipment services (tractor, plowing, threshing, purification, etc.). Users browse via USSD option 4. **Pricing is per acre** — farmer enters acres, total = price × acres. Services may include **tractor registration number** (official equipment ID). Provider USSD extensions (50–99) are **system-generated** on create. Admins manage providers and services.

### GET /api/admin/mechanization/providers

List mechanization providers. Each provider includes only **active** services (`is_active: true`).

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | number | Page number (default 1) |
| limit | number | Items per page (default 20, max 100) |
| active | boolean | Filter by is_active (true/false) |
| region | string | Filter by region (partial match) |

**Success Response (200):**
```json
{
  "providers": [
    {
      "id": 1,
      "name": "Northern Tractors",
      "phone": "233244111001",
      "momo_number": "0244111001",
      "region": "Northern",
      "is_active": true,
      "MechanizationServices": [
        { "id": 1, "service_type": "plowing", "price_per_unit": 250, "unit": "per_acre", "tractor_registration_number": "TRC-2024-001" }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3 }
}
```

### POST /api/admin/mechanization/providers

Create provider.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Provider name |
| phone | string | Yes | Contact phone |
| momo_number | string | No | MoMo number for payments |
| region | string | No | Area served (e.g. Northern, Ashanti) |

**Note:** `provider_code` (USSD extension) is **system-generated** automatically (50–99). Not accepted in request body.

**Success Response (201):** Created provider object (includes `provider_code` — system-generated USSD extension)

**Error Responses:**
- `400` — Name and phone required

### GET /api/admin/mechanization/providers/:id

Provider details with all services (active and inactive). Includes `tractor_registration_number` when set.

**Success Response (200):** Provider object with nested `MechanizationServices` array

**Error Responses:**
- `404` — Provider not found

### PATCH /api/admin/mechanization/providers/:id

Update provider. Only provided fields are updated.

**Request Body:** `{ name?, phone?, momo_number?, region?, is_active? }` — `provider_code` is system-generated and not editable.

**Success Response (200):** Updated provider object

**Error Responses:**
- `404` — Provider not found

### POST /api/admin/mechanization/providers/:id/services

Add service to a provider.

**Request Body:**

| Field | Values | Description |
|-------|--------|-------------|
| service_type | tractor, plowing, threshing, harvesting, seed_drill, irrigation, sprayer, purification, other | Required |
| price_per_unit | number | Price in GHS (required) |
| unit | per_acre, per_hour, per_day, per_job | Default: per_acre. For per_acre, USSD asks farmer for acres; total = price × acres |
| description | string | Optional |
| tractor_registration_number | string | **Required.** Official tractor/equipment registration number. Used to track earnings and commission per tractor. Shown in USSD and admin. |

**Success Response (201):** Created service object (includes `id`, `provider_id`, `service_type`, `price_per_unit`, `unit`, `description`, `tractor_registration_number`, `is_active`)

**Error Responses:**
- `400` — Valid service_type, price_per_unit, or tractor_registration_number required (tractor_registration_number is required for tracking earnings per tractor)
- `404` — Provider not found

### PATCH /api/admin/mechanization/services/:id

Update service. Only provided fields are updated.

**Request Body:** `{ service_type?, price_per_unit?, unit?, description?, tractor_registration_number?, is_active? }` — when updating tractor_registration_number, it cannot be empty (required for tracking earnings per tractor)

**Success Response (200):** Updated service object

**Error Responses:**
- `400` — tractor_registration_number cannot be empty when provided
- `404` — Service not found

### GET /api/admin/mechanization/transactions

List mechanization transactions (10% commission per tractor service).

**Query Parameters:** `page`, `limit`, `provider_id`, `start`, `end` (ISO dates)

**Success Response (200):** `{ transactions: MechanizationTransaction[], pagination }`

### POST /api/admin/mechanization/transactions

Record a completed tractor service. FarmWallet takes 10% commission (configurable via `MECHANIZATION_COMMISSION_PERCENT`).

**Request Body:** `{ provider_id, service_id, amount, farmer_phone? }`

**Success Response (201):** Created transaction with `farmwallet_commission` (10% of amount)

---

## VSLA API

The VSLA (Village Savings and Loan Association) API reads from the external VSL database when `VSL_DB_*` is configured. All endpoints except `GET /api/vsla` require an API key via `X-Api-Key` header or `?api_key=xxx` (dev only). Use `ADMIN_API_KEY` or `VSLA_API_KEY`.

### GET /api/vsla

Returns VSLA API status and available endpoints. No auth required.

**Response (configured):**
```json
{
  "vsla": true,
  "configured": true,
  "endpoints": [
    "GET /api/vsla/profile?phone=xxx",
    "GET /api/vsla/profile/:phone/groups",
    "GET /api/vsla/profile/:phone/savings",
    "GET /api/vsla/profile/:phone/visits",
    "POST /api/vsla/contribute"
  ]
}
```

### GET /api/vsla/profile

Look up user by phone number.

**Query:** `phone` (required) — e.g. `0555227753` or `233555227753`

**Success (200):**
```json
{
  "id": "uuid",
  "fullname": "John Doe",
  "userType": "farmer",
  "status": "approved",
  "phoneNumber": "233555227753"
}
```

**Errors:** 400 (missing phone), 404 (user not found), 503 (VSLA DB not configured)

### GET /api/vsla/profile/:phone/groups

Returns groups for the user. For farmers/vsla_leader/input_dealer: membership groups. For VBA: assigned groups.

**Success (200):**
```json
{
  "type": "membership",
  "groups": [
    { "id": "uuid", "name": "Group A", "isActive": true }
  ]
}
```

### GET /api/vsla/profile/:phone/savings

Returns total confirmed savings contributions per group.

**Success (200):**
```json
{
  "savings": [
    { "groupId": "uuid", "groupName": "Group A", "total": "150.00" }
  ]
}
```

### GET /api/vsla/profile/:phone/visits

Returns upcoming scheduled visits. VBA users only; others get empty array.

**Success (200):**
```json
{
  "visits": [
    {
      "id": "uuid",
      "scheduleCode": "V001",
      "groupId": "uuid",
      "farmerId": "uuid",
      "typeOfVisit": "deposit",
      "scheduledAt": "2025-03-10",
      "scheduledTime": "10:00:00",
      "status": "scheduled"
    }
  ]
}
```

### POST /api/vsla/contribute

Initiate a savings contribution via MoMo (Paystack). Creates a pending `SavingsContribution` in the VSL database and sends a Paystack charge to the user's phone. On `charge.success` webhook, the contribution is confirmed and the group's `GroupWallet.mainBalance` is updated.

**Body:**
```json
{
  "phone": "0555227753",
  "groupId": "uuid",
  "amount": 10.50,
  "momoProvider": "mtn",
  "recordedBy": "uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Payer phone |
| groupId | string | Yes | VSLA group UUID |
| amount | number | Yes | Amount in GHS (min 0.10) |
| momoProvider | string | No | mtn, vodafone, airteltigo (default: mtn) |
| recordedBy | string | No | VBA/user ID who recorded |

**Success (200):**
```json
{
  "success": true,
  "contributionId": "uuid",
  "reference": "SAV-1731234567890-abc123",
  "status": "PENDING",
  "message": "MoMo prompt sent. Complete payment on your phone."
}
```

**Errors:** 400 (invalid/missing params), 404 (user not found), 503 (VSLA DB not configured)

---

## Paystack Webhook

The Paystack webhook receives payment events. It handles:

- **Rice sales** (`SALE-*` reference): Marks sale completed, initiates transfer to exhibitor
- **VSLA contributions** (`SAV-*` reference): Marks contribution confirmed, increments `GroupWallet.mainBalance`

**Do not call manually.** Configure the webhook URL in your [Paystack Dashboard](https://dashboard.paystack.co/#/settings/developer) → Settings → API Keys & Webhooks.

### POST /api/paystack/webhook

**Webhook URL:** `https://your-domain/api/paystack/webhook`

Paystack sends `charge.success` and `charge.failed` events when a mobile money payment completes or fails.

**Request Headers:**
| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Paystack-Signature` | HMAC SHA512 signature (verify with `PAYSTACK_WEBHOOK_SECRET`) |

**Request Body (Paystack event format):**
```json
{
  "event": "charge.success",
  "data": {
    "reference": "SALE-1234567890",
    "status": "success",
    "amount": 12000,
    "currency": "GHS"
  }
}
```

| Event | Description |
|-------|-------------|
| `charge.success` | Payment completed. System updates sale status and initiates exhibitor payout via Paystack Transfer. |
| `charge.failed` | Payment failed. System updates sale status to `failed`. |

**Response:** `200 OK` (plain text)

On `charge.success`, the system:
1. Updates the sale record to `momo_status: completed`
2. Initiates a Paystack Transfer to the exhibitor's MoMo number (MTN, Vodafone, or AirtelTigo)

**Environment:** Set `PAYSTACK_SECRET_KEY` for real payments. If unset, the app uses mock mode (no real charges).

---

## Error Responses

| Status | Description |
|--------|-------------|
| 400 | Bad Request — Invalid or missing parameters |
| 401 | Unauthorized — Invalid or missing API key / token |
| 404 | Not Found — Resource does not exist |
| 405 | Method Not Allowed — Wrong HTTP method |
| 500 | Internal Server Error — Server error |
| 503 | Service Unavailable — API key used but `ADMIN_API_KEY` not set |

**Error format:**
```json
{
  "error": "Error message"
}
```

---

## Data Models

### Admin

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| phone | string | Phone number (unique) |
| password_hash | string | Bcrypt hash |
| name | string | Display name |
| is_active | boolean | Active status |

### Exhibitor (Shop)

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| shop_id | string | Digital shop ID (e.g. 01) |
| ghana_card | string | Ghana Card national ID |
| name | string | Shop name |
| phone | string | Phone number |
| momo_number | string | MoMo number for payouts |
| momo_provider | enum | mtn, vodafone, airteltigo |
| exhibition_day | integer | Legacy: 1, 2, or 3 (kept for DB compatibility; no longer used for filtering) |
| is_active | boolean | Active status |

### ExhibitorInventory

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| exhibitor_id | integer | Exhibitor ID |
| rice_type | string | perfumed, brown, parboiled, jasmine, basmati, other |
| bag_size_kg | integer | Bag size in kg: 5, 25, 50, or 100 (default 50) |
| quantity | integer | Bags in stock |
| price_per_bag | decimal | Price per bag (GHS) |
| verification_status | enum | `pending`, `verified`, `rejected` — only verified show in marketplace |

### Sale

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| exhibitor_id | integer | Exhibitor ID |
| buyer_phone | string | Buyer phone |
| rice_type | string | perfumed, brown, parboiled, jasmine, basmati, other |
| bag_size_kg | integer | Bag size in kg at time of sale (5, 25, 50, 100) |
| quantity | integer | Number of bags |
| amount | decimal | Total amount (GHS) |
| farmwallet_commission | decimal | Commission amount |
| momo_status | enum | initiated, pending, completed, failed |
| momo_reference | string | Sale reference (e.g. SALE-1234567890), used for Paystack charge lookup |
| mtn_reference | string | Paystack transaction reference (for webhook lookup) |

### UssdSession

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| session_id | string | Telco session ID (e.g. from Africa's Talking) |
| phone_number | string | User phone for lookup and resume |
| step | string | Current USSD step (e.g. exhibitor_ghana_card, select_shop) |
| data | JSON | Session state (step-specific data) |
| provider | string | africastalking, arkesel, etc. |

Persistent USSD session storage. Survives server restarts; enables "Continue where you left off?" after telco timeout (~60 sec). TTL: 30 minutes.

### Rice Types

- `perfumed` — Perfumed Rice
- `brown` — Brown Rice
- `parboiled` — Parboiled Rice
- `jasmine` — Jasmine Rice
- `basmati` — Basmati Rice
- `other` — Other Rice

### Bag Sizes (kg)

Rice is sold in bags of different sizes: **5 kg**, **25 kg**, **50 kg**, or **100 kg**. Shop owners select bag size when adding inventory via USSD; buyers see the size when browsing.

### MechanizationProvider

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| name | string | Business name (e.g. Northern Tractors Ltd) |
| phone | string | Contact phone |
| momo_number | string | MoMo for payments (optional) |
| region | string | Area served (e.g. Northern, Ashanti) |
| is_active | boolean | Active status |
| provider_code | string | **Required.** USSD extension (e.g. 50, 51) for *920*72*50# — system-generated, not user-editable |
| pin_hash | string | Hashed 4-digit PIN for dashboard login (optional) |

### MechanizationService

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| provider_id | integer | MechanizationProvider ID |
| service_type | enum | tractor, plowing, threshing, harvesting, seed_drill, irrigation, sprayer, purification, other |
| price_per_unit | decimal | Price (GHS) |
| unit | enum | per_acre (farmer enters acres; total = price × acres), per_hour, per_day, per_job |
| description | string | Optional description |
| tractor_registration_number | string | **Required.** Official tractor/equipment registration number — used to track earnings and commission per tractor |
| is_active | boolean | Active status |

### MechanizationTransaction

| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| provider_id | integer | MechanizationProvider ID |
| provider_name | string | Provider business name at time of transaction (denormalized for reporting) |
| service_id | integer | MechanizationService ID |
| amount | decimal | Total amount paid (GHS) |
| farmer_phone | string | Farmer/customer phone (optional) |
| tractor_registration_number | string | From service — for tracking per tractor |
| farmwallet_commission | decimal | 10% commission to FarmWallet |
| commission_percent | decimal | Commission % at time of transaction (default 10) |

### Mechanization Service Types

- `tractor` — Tractor
- `plowing` — Plowing
- `threshing` — Threshing
- `harvesting` — Harvesting
- `seed_drill` — Seed Drill
- `irrigation` — Irrigation
- `sprayer` — Sprayer
- `purification` — Purification (grain/seed cleaning equipment)
- `other` — Other

---

## Web Dashboards

**Frontend developer guide:** See [FRONTEND_API.md](FRONTEND_API.md) for authentication, endpoints, request/response examples, and integration details.

| URL | Description | Auth |
|-----|-------------|------|
| `/dashboard` | Shop dashboard (login with phone + PIN). View inventory, add products, see sales. | JWT via cookie |
| `/provider` | Mechanization provider dashboard (login with phone + PIN). View services, add tractors, see transactions and earnings. | JWT via cookie |
| `/admin` | Admin dashboard: shops, products, mechanization, commission, admins | Phone + password login (JWT) |

**Base URL:** `http://localhost:3000` (local) or `https://your-domain.com` (production). Dashboards can override via Settings → API Base URL (`localStorage.apiBaseUrl`).

**Provider dashboard:** PIN must be set via `npm run register-provider` (or `node scripts/register-provider.js [phone] [pin]`). Default: phone=0244111001, pin=1234.

**Admin dashboard Settings:** API Base URL and optional Admin API Key can be configured in Settings (stored in `localStorage`). Use when the admin UI is served from a different origin than the API.

**Shop dashboard:** PIN must be set via USSD "Manage My Shop" (option 3) before first login, or use `npm run register-exhibitor` (or `node scripts/register-exhibitor.js [phone] [pin]`) to create/update a shop with a PIN for testing. **Settings:** API Base URL can be configured if the dashboard is served from a different origin.

**USSD shortcodes (display in UI):** *920*72# (main), *920*72*{shop_id}# (shop), *920*72*{provider_code}# (provider).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run create-admin` | Create or update admin user (requires `ADMIN_PHONE` and `ADMIN_PASSWORD` env vars) |
| `npm run verify-inventory` | Set all existing inventory to `verification_status: verified` |
| `npm run seed-products` | Seed shops and products for testing. Usage: `npm run seed-products` (20 shops) or `node scripts/seed-products.js 50` (custom count) |
| `npm run add-bag-size` | Add `bag_size_kg` column to exhibitor_inventory and sales tables (run once after adding bag size support) |
| `npm run add-mechanization` | Create mechanization_providers and mechanization_services tables |
| `npm run seed-mechanization` | Seed sample mechanization providers and services |
| `npm run add-tractor-registration` | Add tractor_registration_number column to mechanization_services |
| `npm run require-tractor-registration` | Make tractor_registration_number required (NOT NULL); backfills NULLs with `UNKNOWN-{id}` |
| `npm run add-mechanization-transactions` | Create mechanization_transactions table (10% commission per tractor service) |
| `npm run add-provider-name-to-transactions` | Add provider_name (business name) column to mechanization_transactions |
| `npm run register-exhibitor` | Register shop with PIN for dashboard login. Usage: `npm run register-exhibitor` or `node scripts/register-exhibitor.js 0555227753 1234` (phone, pin). Creates or updates shop. |
| `npm run add-provider-pin-hash` | Add pin_hash column to mechanization_providers (run once before provider dashboard login) |
| `npm run add-purification-service` | Add 'purification' to mechanization_services.service_type ENUM (run once) |
| `npm run add-provider-code` | Add provider_code column for USSD shortcode *920*72*XX# (run once) |
| `npm run require-provider-code` | Make provider_code required (NOT NULL); backfill any nulls with system-generated codes |
| `npm run add-ussd-extensions` | Create ussd_extensions table; register shops (01-49), providers (50-99), groups (100+) |
| `npm run add-ussd-sessions` | Create `ussd_sessions` table for persistent USSD session storage. Enables resume after telco timeout. |
| `npm run register-provider` | Register mechanization provider with PIN for dashboard login. Usage: `npm run register-provider` or `node scripts/register-provider.js 0244111001 1234` (phone, pin). Creates or updates provider. |

# FarmWallet API — Frontend Developer Guide

Quick reference for building or integrating with the FarmWallet web dashboards (Admin, Shop, Provider).

---

## Base URL & Configuration

| Environment | Base URL |
|-------------|----------|
| Local | `http://localhost:3000` |
| Production | `https://your-domain.com` |

**Settings (stored in `localStorage`):**
- `apiBaseUrl` — Override when dashboards are served from a different origin
- `adminApiKey` — Optional; for admin API key auth (Settings in Admin dashboard)

---

## Authentication

### Admin
```javascript
// Login
const res = await fetch(`${baseUrl}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0555227753', password: 'yourpassword' }),
  credentials: 'include'
});
const { token } = await res.json();

// Subsequent requests — use one of:
// 1. Cookie: admin_token (set automatically with credentials: 'include')
// 2. Header: Authorization: Bearer <token>
fetch(`${baseUrl}/api/admin/dashboard`, {
  headers: { 'Authorization': `Bearer ${token}` },
  credentials: 'include'
});
```

### Exhibitor (Shop)
```javascript
// Login
const res = await fetch(`${baseUrl}/api/exhibitor/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0555227753', pin: '1234' }),
  credentials: 'include'
});
const { token, exhibitor } = await res.json();
// Cookie: exhibitor_token
```

### Provider (Mechanization)
```javascript
// Login
const res = await fetch(`${baseUrl}/api/provider/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0244111001', pin: '1234' }),
  credentials: 'include'
});
const { token, provider } = await res.json();
// Cookie: provider_token
```

---

## Web Dashboard URLs

| Path | Dashboard | Auth |
|------|-----------|------|
| `/admin` | Admin — shops, products, mechanization, commission | Phone + password |
| `/dashboard` | Shop owner — inventory, sales | Phone + PIN |
| `/provider` | Mechanization provider — services, earnings | Phone + PIN |

---

## Admin API Endpoints

All require JWT (cookie `admin_token` or `Authorization: Bearer`) or `X-Api-Key`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Stats: exhibitors, sales, orders, mechanization |
| GET | `/api/admin/commission` | Commission summary with sales breakdown |
| GET | `/api/admin/exhibitors` | List shops (paginated) |
| GET | `/api/admin/exhibitors/:id` | Shop details |
| PATCH | `/api/admin/exhibitors/:id` | Update shop |
| DELETE | `/api/admin/exhibitors/:id` | Deactivate shop |
| GET | `/api/admin/inventory` | List products (query: `status`, `exhibitor_id`) |
| PATCH | `/api/admin/inventory/:id` | Set `verification_status` (verified/rejected) |
| GET | `/api/admin/mechanization/providers` | List mechanization providers |
| POST | `/api/admin/mechanization/providers` | Create provider |
| GET | `/api/admin/mechanization/providers/:id` | Provider with services |
| PATCH | `/api/admin/mechanization/providers/:id` | Update provider |
| POST | `/api/admin/mechanization/providers/:id/services` | Add service |
| GET | `/api/admin/mechanization/services` | List services |
| PATCH | `/api/admin/mechanization/services/:id` | Update service |
| GET | `/api/admin/mechanization/transactions` | List transactions |
| POST | `/api/admin/mechanization/transactions` | Record transaction |
| GET | `/api/admin/data-submissions` | List data submissions (`format=csv` or `json`) |
| POST | `/api/admin/data-submissions/import` | Import CSV |
| GET | `/api/admin/users` | List admin users |
| POST | `/api/admin/users` | Create admin user |

**Create provider:**
```javascript
await fetch(`${baseUrl}/api/admin/mechanization/providers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  credentials: 'include',
  body: JSON.stringify({
    name: 'Provider Name',
    phone: '0244111001',
    momo_number: '0244111001',
    region: 'Northern',
    provider_code: null  // auto-assign 50-99
  })
});
```

**Add service to provider:**
```javascript
await fetch(`${baseUrl}/api/admin/mechanization/providers/${providerId}/services`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  credentials: 'include',
  body: JSON.stringify({
    service_type: 'tractor',
    price_per_unit: 250,
    unit: 'per_acre',
    tractor_registration_number: 'GT-1234-20'
  })
});
```

---

## Exhibitor (Shop) API Endpoints

Require JWT from `/api/exhibitor/login`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/exhibitor/dashboard` | Shop stats, inventory, recent sales |
| POST | `/api/exhibitor/inventory` | Add product |
| POST | `/api/exhibitor/logout` | Logout (clears cookie) |

**Add product:**
```javascript
await fetch(`${baseUrl}/api/exhibitor/inventory`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  credentials: 'include',
  body: JSON.stringify({
    rice_type: 'perfumed',
    bag_size_kg: 50,
    quantity: 10,
    price_per_bag: 350
  })
});
```

---

## Provider API Endpoints

Require JWT from `/api/provider/login`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/provider/dashboard` | Services, transactions, earnings |
| POST | `/api/provider/services` | Add tractor/service |
| POST | `/api/provider/logout` | Logout |

**Add service:**
```javascript
await fetch(`${baseUrl}/api/provider/services`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  credentials: 'include',
  body: JSON.stringify({
    service_type: 'tractor',
    price_per_unit: 250,
    unit: 'per_acre',
    tractor_registration_number: 'GT-1234-20'
  })
});
```

---

## VSLA API (Optional)

When `VSL_DB_*` is configured. Requires `X-Api-Key` or `ADMIN_API_KEY`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vsla` | Status (configured: true/false) |
| GET | `/api/vsla/profile?phone=xxx` | User profile |
| GET | `/api/vsla/profile/:phone/groups` | Groups (with `extension`, `shortcode`) |
| GET | `/api/vsla/profile/:phone/savings` | Savings per group |
| GET | `/api/vsla/profile/:phone/visits` | VBA upcoming visits |
| POST | `/api/vsla/contribute` | Initiate MoMo contribution |

---

## Response Formats

**Success (200):**
```json
{ "token": "...", "exhibitor": { ... } }
```

**Error (4xx/5xx):**
```json
{ "error": "error message" }
```

**Validation:** Check `res.ok` and `res.status`. Parse `await res.json()` for error body.

---

## CORS & Credentials

- Use `credentials: 'include'` for cookie-based auth
- CORS is configured via `CORS_ORIGIN` (comma-separated origins)
- For cross-origin dashboards, set `apiBaseUrl` in Settings and ensure the API allows that origin

---

## USSD Shortcodes (for display)

| Code | Purpose |
|------|---------|
| *920*72# | Main menu |
| *920*72*01# | Direct to Shop 01 |
| *920*72*50# | Direct to Provider (extensions 50-99) |
| *920*72*100# | Direct to VSLA Group (extensions 100+) |

Provider code: `provider.provider_code` (e.g. 50, 51)  
Shop ID: `exhibitor.shop_id` (e.g. 01, 02)

---

## Rice Types & Bag Sizes

**Rice types:** `perfumed`, `brown`, `parboiled`, `jasmine`, `basmati`, `other`  
**Bag sizes (kg):** 5, 25, 50, 100  
**Service types:** `tractor`, `plowing`, `threshing`, `harvesting`, `seed_drill`, `irrigation`, `sprayer`, `other`  
**Units:** `per_acre`, `per_hour`, `per_day`, `per_job`

# FarmWallet Rice Shops

USSD platform for rice exhibitors to register with Ghana Card, create shops, list rice types, and receive payments directly when consumers buy during exhibition days.

## Concept

- **Exhibitors** register with Ghana Card, create a shop, and list rice types (perfumed, brown, parboiled, jasmine, basmati, other)
- **Consumers** dial the shortcode, browse shops, select rice, and pay via MoMo
- **Payments** go directly to the exhibitor's mobile money
- **Exhibition days** – exhibitors are assigned to Day 1, 2, or 3; only shops for the current exhibition day are shown

## USSD Flow

**Shortcode:** `*920*72#` (production) or `*384*64441#` (Africa's Talking sandbox). Direct to shop: `*384*64441*01#`

### Exhibitor Registration
1. Register as Exhibitor (Ghana Card)
2. Enter Ghana Card number
3. Enter business/shop name
4. Enter MoMo number + provider (MTN, Vodafone, AirtelTigo)
5. Select exhibition day (1, 2, or 3)
6. Add rice: type, quantity, price per bag
7. Shop created – receive Shop ID (e.g. 01)

### Consumer Purchase
1. Browse Shops & Buy Rice
2. Select shop (filtered by current exhibition day)
3. Select rice type
4. Enter quantity
5. Confirm payment – MTN MoMo prompt sent; buyer pays; exhibitor receives payout (MTN MoMo)

## Setup

```bash
cp .env.example .env
# Edit .env with DB credentials, Arkesel API key

npm install
npm run dev
```

## Docker

```bash
docker-compose up -d
```

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for a full deployment guide.

**Quick deploy (Railway, Render, Nixpacks):** Connect your repo; set env vars; deploy.

**Required env vars:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`  
**Optional:** `EXHIBITION_DAY`, `FARMWALLET_COMMISSION_PERCENT`, `ADMIN_API_KEY`, `MTN_*`, `ARKESEL_API_KEY`

## Environment

| Variable | Description |
|----------|-------------|
| `EXHIBITION_DAY` | 1, 2, or 3 – only shops for this day are shown to consumers |
| `FARMWALLET_COMMISSION_PERCENT` | Commission % (0–50) on each sale. Default: 2 |
| `ADMIN_API_KEY` | API key for `/api/commission` (optional) |
| `ARKESEL_API_KEY` | Arkesel SMS API key |
| `MTN_*` | MTN MoMo credentials (see below) |
| `DB_*` | MySQL connection |

## Commission

FarmWallet earns a configurable commission on each sale. Set `FARMWALLET_COMMISSION_PERCENT` (default 2%). The buyer pays the full amount; the exhibitor receives (amount − commission). Commission is tracked in the `sales` table.

**Commission API:** `GET /api/commission?api_key=xxx` or `X-Api-Key: xxx`  
Returns total sales, total commission, and per-sale breakdown. Optional `start` and `end` query params for date range.

## Admin API

Set `ADMIN_API_KEY` in `.env`. All admin routes require `X-Api-Key: your_key` or `?api_key=your_key`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/dashboard` | GET | Summary stats (exhibitors, sales, commission) |
| `/api/admin/exhibitors` | GET | List exhibitors (query: page, limit, day, active, search) |
| `/api/admin/exhibitors/:id` | GET | Exhibitor details with inventory and sales |
| `/api/admin/exhibitors/:id` | PATCH | Update exhibitor (is_active, name, exhibition_day, momo_number, momo_provider) |
| `/api/admin/exhibitors/:id` | DELETE | Deactivate exhibitor (soft delete) |

## Security

- **Helmet** – HTTP security headers
- **Rate limiting** – USSD: 30 req/min per IP; API: 100 req/15 min
- **Input sanitization** – USSD inputs trimmed, length-limited, control chars stripped
- **Ghana Card / phone validation** – Format checks on exhibitor registration

## MTN MoMo API (Ghana)

The app uses **MTN MoMo** for mobile money payments.

### Authentication

- **Subscription Key** – From API Manager Portal (Profile), used in `Ocp-Apim-Subscription-Key` header
- **API User + API Key** – For OAuth 2.0; created via Provisioning API (sandbox) or Partner Portal (production)

### Sandbox Provisioning

```bash
# Create API User and Key for Collection
MTN_CALLBACK_HOST=your-ngrok.ngrok-free.app \
MTN_COLLECTION_SUBSCRIPTION_KEY=your_key \
  node scripts/mtn-provision-sandbox.js collection

# Create for Disbursement
MTN_DISBURSEMENT_SUBSCRIPTION_KEY=your_key \
  node scripts/mtn-provision-sandbox.js disbursement
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MTN_BASE_URL` | `https://sandbox.momodeveloper.mtn.com` (sandbox) or production URL |
| `MTN_TARGET_ENV` | `sandbox` or `mtnghana` (production) |
| `MTN_CALLBACK_URL` | Base URL for callbacks (e.g. `https://your-domain`) |
| `MTN_COLLECTION_USER_ID` | API User UUID (X-Reference-Id from provisioning) |
| `MTN_COLLECTION_API_KEY` | API Key from provisioning |
| `MTN_COLLECTION_SUBSCRIPTION_KEY` | Collection product subscription key |
| `MTN_DISBURSEMENT_*` | Same for Disbursement product |

### Callback

MTN sends callbacks via **PUT** when payment status changes. Callback URL: `{MTN_CALLBACK_URL}/api/mtn/callback/collection`

### Optional: Validate Payer

Set `MTN_VALIDATE_PAYER=true` to check if the buyer has an active MoMo wallet before initiating payment. This can prevent `PAYER_NOT_FOUND` errors.

If MTN credentials are not set, the app falls back to mock payments (no real charge).

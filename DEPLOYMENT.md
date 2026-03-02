# FarmWallet Rice – Deployment Guide

## Pre-deployment checklist

- [ ] MySQL database provisioned (Railway, PlanetScale, Render, or self-hosted)
- [ ] Environment variables configured (see below)
- [ ] MTN MoMo credentials (Collection + Disbursement) for production
- [ ] Africa's Talking / Arkesel USSD callback URL set to your deployed domain
- [ ] MTN callback URL set to `https://your-domain/api/mtn/callback/collection`

## Required environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | MySQL host |
| `DB_PORT` | Yes | MySQL port (usually 3306) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `PORT` | No | Server port (default 3000, set by platform) |
| `NODE_ENV` | No | `production` for deploy |

### Optional

| Variable | Description |
|----------|-------------|
| `EXHIBITION_DAY` | 1, 2, or 3 (default: 1) |
| `FARMWALLET_COMMISSION_PERCENT` | Commission % (default: 2) |
| `ADMIN_API_KEY` | For `/api/commission` |
| `ARKESEL_API_KEY` | SMS notifications |
| `MTN_*` | MTN MoMo credentials (see README) |
| `MTN_CALLBACK_URL` | Base URL for MTN callbacks (e.g. `https://yourapp.railway.app`) |

## Deployment options

### 1. Railway

1. Connect your Git repo
2. Add MySQL plugin or external DB
3. Set env vars in Variables
4. Deploy – Nixpacks will build automatically

### 2. Render

1. New Web Service → Connect repo
2. Build: `npm install`
3. Start: `node src/server.js`
4. Add MySQL (or external) and set env vars

### 3. Docker

```bash
docker build -t farmwallet-rice .
docker run -p 3000:3000 --env-file .env farmwallet-rice
```

### 4. Docker Compose (app + MySQL)

```bash
cp .env.example .env
# Edit .env with production values
docker-compose up -d
```

### 5. Heroku

```bash
heroku create
heroku addons:create jawsdb  # or ClearDB for MySQL
heroku config:set $(cat .env | xargs)
git push heroku main
```

## Post-deployment

1. **Run migration** (if needed):
   ```bash
   node scripts/add-mtn-reference.js
   ```

2. **Configure USSD callback**  
   Set your provider's callback URL to:  
   `https://your-domain/ussd`

3. **Configure MTN callback**  
   Set `MTN_CALLBACK_URL` to your base URL (e.g. `https://yourapp.railway.app`)

4. **Test**
   - `GET https://your-domain/health` → `{"status":"ok"}`
   - `POST https://your-domain/ussd` with test payload

## Health check

- **Endpoint:** `GET /health`
- **Success:** `200` with `{"status":"ok","timestamp":"..."}`

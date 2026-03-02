# Security Audit Report

**Date:** March 2025  
**Scope:** FarmWallet Rice Shops USSD platform

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 1 | See recommendations |
| High | 2 | Fixes available |
| Medium | 3 | Mitigations in place |
| Low | 2 | Best practices |

---

## Critical

### 1. MTN MoMo Callback Unauthenticated

**Location:** `src/routes/index.js` — `PUT/POST /api/mtn/callback/collection`

**Issue:** The MTN payment callback has no authentication. Anyone who discovers the callback URL can:
- Send fake `SUCCESSFUL` status to mark unpaid sales as completed
- Trigger disbursement to exhibitors (FarmWallet pays out)
- Result: Buyer gets rice without paying; FarmWallet loses money

**Mitigation:** MTN MoMo does not provide built-in webhook signatures. Options:
1. **IP allowlisting** — Restrict callback to MTN’s published IP ranges (if available)
2. **Reference validation** — Only accept callbacks for references that match recent `requestToPay` responses (store X-Reference-Id server-side)
3. **HTTPS only** — Use HTTPS in production; callback URL is not guessable if kept private
4. **Monitor** — Alert on unexpected callback patterns

**Recommendation:** Contact MTN for production callback security guidance. Use HTTPS and avoid exposing callback URL in logs or docs.

---

## High

### 2. API Key in Query String (Commission Endpoint)

**Location:** `src/routes/index.js` — `GET /api/commission`

**Issue:** `requireAdminApiKey` accepts `api_key` in the query string. In production this can:
- Leak in server logs, proxy logs, browser history
- Appear in Referer headers if linked from another site

**Fix:** Reject `api_key` from query in production; require `X-Api-Key` header only.

---

### 3. CSV Import — No Row Limit (DoS)

**Location:** `src/routes/admin.js` — `POST /api/admin/data-submissions/import`

**Issue:** A 2MB CSV can contain tens of thousands of rows. Each row triggers a DB insert. An authenticated admin (or compromised account) could cause:
- Database overload
- Long request timeouts
- Memory pressure

**Fix:** Enforce a maximum row limit (e.g. 5,000 per import).

---

## Medium

### 4. CORS Default `origin: true`

**Location:** `src/server.js`

**Issue:** When `CORS_ORIGIN` is unset, CORS uses `origin: true`, reflecting the request origin. Any site can make credentialed requests if the user is logged in.

**Mitigation:** Set `CORS_ORIGIN` explicitly in production (e.g. `https://admin.yourdomain.com`).

---

### 5. JWT Secret in Development

**Location:** `src/config/auth.js`

**Issue:** Fallback secret `farmwallet-rice-dev-secret-change-in-production` when `JWT_SECRET` is unset.

**Mitigation:** Production requires `JWT_SECRET` (min 32 chars); app exits if not set. Dev fallback is acceptable if never used in production.

---

### 6. Express Body Limits

**Location:** `src/server.js` — `express.json({ limit: '10kb' })`

**Issue:** 10KB is strict; large payloads (e.g. bulk operations) may fail. Multer for CSV import uses 2MB separately.

**Status:** Acceptable for current use. Revisit if adding bulk JSON endpoints.

---

## Low

### 7. `.env` in Version Control

**Status:** `.env` is in `.dockerignore`. Ensure `.gitignore` includes `.env` so it is never committed.

---

### 8. Content Security Policy Disabled

**Location:** `src/middleware/security.js` — `contentSecurityPolicy: false`

**Issue:** CSP is disabled for USSD provider flexibility.

**Status:** Documented. Re-enable with a tailored policy when possible.

---

## What’s Done Well

- **SQL injection:** Sequelize parameterized queries; `escapeLike` for LIKE patterns
- **XSS:** `escapeHtml` used for user content in admin/dashboard/provider UIs
- **Rate limiting:** API (100/15min), USSD (30/min), login (5/15min)
- **Passwords:** bcrypt with salt rounds
- **JWT:** Production enforces strong secret; cookies `httpOnly`, `secure` in prod
- **Input validation:** Ghana phone, Ghana Card, PIN formats validated
- **Admin auth:** Query `api_key` disabled in production; JWT or header required

---

## Recommended Actions

1. **Immediate:** Fix commission endpoint to reject `api_key` in query for production
2. **Immediate:** Add max row limit (5,000) to CSV import
3. **Short-term:** Implement MTN callback validation (IP allowlist or reference checks)
4. **Ongoing:** Set `CORS_ORIGIN` in production; rotate `JWT_SECRET` and `ADMIN_API_KEY` periodically

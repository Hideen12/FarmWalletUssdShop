# Security

> **Security Audit:** See [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for the latest vulnerability assessment and recommendations.

## Implemented Measures

### Authentication & Secrets
- **JWT_SECRET**: Required in production (min 32 chars). App exits if not set when `NODE_ENV=production`.
- **Admin API Key**: `/api/commission` requires `ADMIN_API_KEY` when using API key auth. Returns 503 if not configured.
- **Token in URLs**: Query params `?token=` and `?api_key=` disabled in production to avoid logging exposure (admin routes and commission endpoint).

### Rate Limiting
- **API**: 100 requests per 15 min per IP
- **USSD**: 30 requests per minute per IP
- **Login**: 5 attempts per 15 min per IP (admin, exhibitor, provider)

### Input Validation
- **LIKE queries**: Search and region params escaped to prevent SQL LIKE wildcard injection (`%`, `_`).
- **MTN callback**: Reference trimmed and length-limited.
- **CSV import**: Max 5,000 rows per import to prevent DoS.

### HTTP Security
- **Helmet**: Security headers enabled (CSP relaxed for USSD flexibility).
- **Cookies**: `secure: true` in production, `httpOnly`, `sameSite: 'lax'`.
- **CORS**: Configurable via `CORS_ORIGIN` (comma-separated). Default: same-origin.
- **Error responses**: 5xx errors return generic message in production; stack traces only in development.

### XSS Prevention
- **Dashboards**: User data escaped before insertion into `innerHTML` (admin, exhibitor, provider dashboards).

## Recommendations

1. **MTN MoMo Callback**: Consider IP allowlisting or webhook secret if MTN supports it. Callback URL should be HTTPS in production.
2. **Admin passwords**: Use strong passwords (8+ chars). Consider increasing minimum.
3. **CORS_ORIGIN**: Set explicitly in production, e.g. `https://admin.yourdomain.com`.
4. **Secrets**: Rotate `JWT_SECRET` and `ADMIN_API_KEY` periodically. Never commit `.env`.

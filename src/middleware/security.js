const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

/**
 * Helmet - security HTTP headers
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: false, // USSD providers may need flexibility
  crossOriginEmbedderPolicy: false,
});

/**
 * General API rate limit - 100 requests per 15 min per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * USSD endpoint - stricter limit (USSD sessions are short, but prevent abuse)
 * 30 requests per minute per IP (typical USSD session = 5-15 requests)
 */
const ussdLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many USSD requests. Try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Login endpoints - strict limit to prevent brute force (5 attempts per 15 min per IP)
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Sanitize USSD input - prevent injection and limit length
 */
function sanitizeUssdInput(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars
    .slice(0, maxLen);
}

/**
 * Validate Ghana phone number format (233XXXXXXXXX or 0XXXXXXXXX)
 */
function isValidGhanaPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  return (cleaned.length === 10 && /^0\d{9}$/.test(cleaned)) ||
    (cleaned.length === 12 && cleaned.startsWith('233'));
}

/**
 * Validate Ghana Card format (basic - alphanumeric, 8-20 chars)
 */
function isValidGhanaCard(card) {
  if (!card || typeof card !== 'string') return false;
  const cleaned = card.trim();
  return /^[A-Za-z0-9\-]+$/.test(cleaned) && cleaned.length >= 8 && cleaned.length <= 20;
}

/**
 * Validate 4-digit PIN format
 */
function isValidPin(pin) {
  if (!pin || typeof pin !== 'string') return false;
  return /^\d{4}$/.test(pin.trim());
}

/**
 * Escape LIKE wildcards (% and _) to prevent injection in SQL LIKE clauses
 */
function escapeLike(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[%_\\]/g, '\\$&').slice(0, 200);
}

module.exports = {
  helmetMiddleware,
  apiLimiter,
  ussdLimiter,
  loginLimiter,
  sanitizeUssdInput,
  isValidGhanaPhone,
  isValidGhanaCard,
  isValidPin,
  escapeLike,
};

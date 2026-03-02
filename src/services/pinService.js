const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Hash a 4-digit PIN for storage
 */
async function hashPin(pin) {
  if (!pin || String(pin).length !== 4) return null;
  return bcrypt.hash(String(pin), SALT_ROUNDS);
}

/**
 * Verify a plain PIN against stored hash
 */
async function verifyPin(plainPin, hash) {
  if (!plainPin || !hash) return false;
  return bcrypt.compare(String(plainPin), hash);
}

/**
 * Hash a password for storage (e.g. admin)
 */
async function hashPassword(password) {
  if (!password || String(password).length < 6) return null;
  return bcrypt.hash(String(password), SALT_ROUNDS);
}

/**
 * Verify a plain password against stored hash
 */
async function verifyPassword(plainPassword, hash) {
  if (!plainPassword || !hash) return false;
  return bcrypt.compare(String(plainPassword), hash);
}

module.exports = { hashPin, verifyPin, hashPassword, verifyPassword };

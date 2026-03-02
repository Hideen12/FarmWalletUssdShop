/**
 * USSD session store - database-backed for persistence
 *
 * Africa's Talking session timeout is ~30-60 sec (telco-controlled, cannot extend).
 * We persist to MySQL so:
 * - Sessions survive server restarts
 * - Users can RESUME after timeout: when they dial again (new sessionId), we look up
 *   by phone and offer "Continue registration? 1. Yes 2. No"
 *
 * Run: npm run add-ussd-sessions (creates ussd_sessions table)
 */
const { Op } = require('sequelize');

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min
const RESUMABLE_STEPS = new Set([
  'exhibitor_ghana_card', 'exhibitor_name', 'exhibitor_momo', 'exhibitor_momo_provider',
  'exhibitor_pin_create', 'exhibitor_pin_confirm', 'exhibitor_rice_type', 'exhibitor_bag_size',
  'exhibitor_qty', 'exhibitor_price', 'exhibitor_add_more', 'exhibitor_set_pin',
  'exhibitor_set_pin_confirm', 'exhibitor_manage_menu', 'select_shop', 'exhibitor_shop',
]);

let db = null;
let useDb = false;

function initDb() {
  if (db) return;
  try {
    db = require('../models');
    useDb = !!db.UssdSession;
  } catch {
    useDb = false;
  }
}

const memorySessions = new Map();

function getSessionKey(sessionId, phoneNumber) {
  return `${String(sessionId || '')}:${String(phoneNumber || '')}`;
}

function get(sessionId, phoneNumber) {
  const key = getSessionKey(sessionId, phoneNumber);
  const session = memorySessions.get(key);
  if (!session) return null;
  if (Date.now() - (session.updatedAt || 0) > SESSION_TTL_MS) {
    memorySessions.delete(key);
    return null;
  }
  return session;
}

function set(sessionId, phoneNumber, data, provider = null) {
  const payload = { ...data, updatedAt: Date.now() };
  memorySessions.set(getSessionKey(sessionId, phoneNumber), payload);

  initDb();
  if (useDb && db?.UssdSession) {
    const step = data.step || 'menu';
    const dataJson = { ...(data.data || {}), ...data };
    delete dataJson.step;
    db.UssdSession.upsert({
      session_id: String(sessionId || ''),
      phone_number: String(phoneNumber || ''),
      step,
      data: dataJson,
      provider: provider || null,
      updated_at: new Date(),
    }, { conflictFields: ['session_id', 'phone_number'] }).catch(err => {
      console.warn('USSD session DB write failed:', err.message);
    });
  }
}

function clear(sessionId, phoneNumber) {
  memorySessions.delete(getSessionKey(sessionId, phoneNumber));
  initDb();
  if (useDb && db?.UssdSession) {
    db.UssdSession.destroy({
      where: { session_id: String(sessionId || ''), phone_number: String(phoneNumber || '') },
    }).catch(() => {});
  }
}

/**
 * Hydrate session from DB (for server restart or resume after telco timeout)
 * 1) Try sessionId+phone (same session, server restarted)
 * 2) Try resumable by phone (new sessionId after timeout)
 */
async function hydrate(sessionId, phoneNumber) {
  initDb();
  if (!useDb || !db?.UssdSession) return null;
  try {
    const row = await db.UssdSession.findOne({
      where: {
        session_id: String(sessionId || ''),
        phone_number: String(phoneNumber || ''),
        updated_at: { [Op.gte]: new Date(Date.now() - SESSION_TTL_MS) },
      },
    });
    if (row) {
      return { step: row.step, data: row.data || {}, updatedAt: row.updatedAt?.getTime?.() };
    }

    const resumable = await db.UssdSession.findOne({
      where: {
        phone_number: String(phoneNumber || ''),
        step: { [Op.in]: Array.from(RESUMABLE_STEPS) },
        updated_at: { [Op.gte]: new Date(Date.now() - SESSION_TTL_MS) },
      },
      order: [['updated_at', 'DESC']],
    });
    if (resumable) {
      return { step: 'resume_prompt', data: { savedStep: resumable.step, savedData: resumable.data || {} } };
    }
  } catch (err) {
    console.warn('USSD session hydrate failed:', err.message);
  }
  return null;
}

/**
 * Clear resumable sessions for this phone (after completing registration)
 */
function clearResumable(phoneNumber) {
  initDb();
  if (!useDb || !db?.UssdSession) return;
  db.UssdSession.destroy({
    where: {
      phone_number: String(phoneNumber || ''),
      step: { [Op.in]: Array.from(RESUMABLE_STEPS) },
    },
  }).catch(() => {});
}

module.exports = { get, set, clear, hydrate, clearResumable };

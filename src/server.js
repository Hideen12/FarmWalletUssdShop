require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const db = require('./models');
const { handleUSSD } = require('./ussd/ussdHandler');
const apiRoutes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { helmetMiddleware, apiLimiter, ussdLimiter, loginLimiter } = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - parse once, trim spaces, and handle preflight before routes
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsConfig = { origin: corsOrigins.length ? corsOrigins : true, credentials: true };
app.use(cors(corsConfig));
app.options('*', cors(corsConfig));
app.use(helmetMiddleware);
app.use(cookieParser());

// Paystack webhook - must use raw body (before json parser) for signature verification
const paystackWebhook = require('./routes/paystackWebhook');
app.post('/api/paystack/webhook', express.raw({ type: 'application/json' }), paystackWebhook);

app.use(express.json({ limit: '5kb' }));
app.use(express.urlencoded({ extended: false, limit: '5kb' }));

// Minimal root - reduces payload and parse time
app.get('/', (req, res) => res.json({ status: 'ok', service: 'FarmWallet Rice Shops' }));

// Health check - minimal JSON for load balancers
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// SSL validation - cached at startup (avoids fs per request)
const sslValidationPath = path.join(__dirname, '..', '6E7A87F8F3C41A1D2B3C317EAAE61127.txt');
const sslValidationContent = (() => {
  try {
    return fs.existsSync(sslValidationPath) ? fs.readFileSync(sslValidationPath, 'utf8') : null;
  } catch {
    return null;
  }
})();
const sslValidationHandler = (req, res) => {
  if (sslValidationContent) res.type('text/plain').send(sslValidationContent);
  else res.status(404).send('Not found');
};
app.get('/6E7A87F8F3C41A1D2B3C317EAAE61127.txt', sslValidationHandler);
app.get('/.well-known/pki-validation/6E7A87F8F3C41A1D2B3C317EAAE61127.txt', sslValidationHandler);

app.get('/ussd', (req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'USSD callback expects POST.',
    usage: 'POST /ussd with sessionId, phoneNumber, text, serviceCode',
  });
});
app.post('/ussd', ussdLimiter, handleUSSD);
app.use('/api', apiLimiter, apiRoutes);

app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html')));
app.get('/dashboard/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html')));

app.use('/provider', express.static(path.join(__dirname, 'public', 'provider')));
app.get('/provider', (req, res) => res.sendFile(path.join(__dirname, 'public', 'provider', 'index.html')));
app.get('/provider/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'provider', 'index.html')));

app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

app.use(errorHandler);

async function connectDB(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.sequelize.authenticate();
      await db.sequelize.sync({ alter: false });
      console.log('Database connected');
      return;
    } catch (err) {
      console.warn(`Database connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i === retries - 1) {
        console.error('Database connection failed');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function start() {
  await connectDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FarmWallet Rice Shops HTTP on port ${PORT}`);
    const publicBaseUrl = process.env.PUBLIC_BASE_URL
      || (process.env.NODE_ENV === 'production' ? 'https://ussdapi.farmwallet.org' : null);
    const baseUrl = publicBaseUrl || `http://localhost:${PORT}`;
    console.log(`USSD: POST ${baseUrl}/ussd`);
    console.log(`Paystack webhook: POST ${baseUrl}/api/paystack/webhook`);
    console.log(`Shortcode: *920*72# or *920*72*01# for Shop 01`);
    console.log(`USSD: *920*72# (main), *920*72*XX# for direct access`);
  });
}

start().catch(console.error);

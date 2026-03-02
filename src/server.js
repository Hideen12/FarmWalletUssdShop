require('dotenv').config();
const fs = require('fs');
const https = require('https');
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

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  })
);
app.use(helmetMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.get('/', (req, res) => {
  res.json({
    service: 'FarmWallet Rice Shops',
    status: 'running',
    version: '1.0',
    endpoints: {
      ussd: 'POST /ussd',
      health: 'GET /health',
      dashboard: 'GET /dashboard (exhibitor login)',
      providerDashboard: 'GET /provider (mechanization provider login)',
      adminDashboard: 'GET /admin (exhibitors, products, mechanization)',
      admin: 'GET /api/admin/* (JWT or X-Api-Key)',
    },
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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

  const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, '..', 'ssl', 'server.crt');
  const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, '..', 'ssl', 'server.key');
  const caPath = process.env.SSL_CA_PATH || path.join(__dirname, '..', 'ssl', 'server.ca-bundle');
  const httpsPort = parseInt(process.env.HTTPS_PORT || '3443', 10);

  const hasCert = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (hasCert) {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    if (fs.existsSync(caPath)) {
      httpsOptions.ca = fs.readFileSync(caPath);
    }
    const server = https.createServer(httpsOptions, app);
    server.listen(httpsPort, () => {
      console.log(`FarmWallet Rice Shops HTTPS on port ${httpsPort}`);
    });
  }

  app.listen(PORT, () => {
    console.log(`FarmWallet Rice Shops HTTP on port ${PORT}`);
    const scheme = hasCert ? 'https' : 'http';
    const port = hasCert ? httpsPort : PORT;
    console.log(`USSD: POST ${scheme}://your-domain:${port}/ussd`);
    console.log(`MTN callback: POST ${scheme}://your-domain:${port}/api/mtn/callback/collection`);
    console.log(`Shortcode: *920*72# or *920*72*01# for Shop 01`);
    console.log(`Mechanization: *920*73# or *920*73*01# for Provider 01`);
  });
}

start().catch(console.error);

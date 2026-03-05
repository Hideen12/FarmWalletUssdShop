#!/usr/bin/env node
/**
 * Register a mechanization provider with PIN for dashboard login
 * Usage: node scripts/register-provider.js [phone] [pin]
 * Default: phone=0244111001, pin=1234
 */
require('dotenv').config();
const db = require('../src/models');
const pinService = require('../src/services/pinService');

const phone = process.argv[2] || '0244111001';
const pin = process.argv[3] || '1234';
const phoneNorm = phone.replace(/\D/g, '').startsWith('233') ? phone.replace(/\D/g, '') : '233' + phone.replace(/\D/g, '').slice(-9);

async function register() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    let provider = await db.MechanizationProvider.findOne({ where: { phone: phoneNorm } });
    if (provider) {
      const pinHash = await pinService.hashPin(pin);
      await provider.update({ pin_hash: pinHash });
      console.log(`Updated existing provider with PIN`);
    } else {
      let providerCode;
      if (db.UssdExtension) {
        const [rows] = await db.sequelize.query(
          `SELECT COALESCE(MAX(CAST(extension AS UNSIGNED)), 49) + 1 as next FROM ussd_extensions WHERE CAST(extension AS UNSIGNED) BETWEEN 50 AND 99`
        );
        const next = Math.min(Number(rows?.[0]?.next || 50), 99);
        providerCode = String(next).padStart(2, '0');
      } else {
        const count = await db.MechanizationProvider.count();
        providerCode = String(Math.min(50 + count, 99)).padStart(2, '0');
      }
      provider = await db.MechanizationProvider.create({
        name: 'Demo Mechanization Provider',
        phone: phoneNorm,
        momo_number: phoneNorm.replace('233', '0'),
        region: 'Ashanti',
        provider_code: providerCode,
        is_active: true,
        pin_hash: await pinService.hashPin(pin),
      });
      if (db.UssdExtension) {
        await db.UssdExtension.findOrCreate({
          where: { extension: providerCode },
          defaults: { entityType: 'provider', entityRef: String(provider.id) },
        });
      }
      await db.MechanizationService.create({
        provider_id: provider.id,
        service_type: 'tractor',
        price_per_unit: 100,
        unit: 'per_acre',
        tractor_registration_number: 'TRC-DEMO-01',
        is_active: true,
      });
      console.log(`Provider created!`);
    }

    console.log(`
Mechanization Provider Dashboard Login
======================================
URL:      http://localhost:3000/provider
Phone:    ${phone.replace(/\D/g, '').length === 10 ? '0' + phone.replace(/\D/g, '').slice(-9) : phone}
PIN:      ${pin}

Name:     ${provider.name}
Region:   ${provider.region}
Code:     ${provider.provider_code || '-'}
Shortcode: *920*72*${provider.provider_code || 'XX'}# (direct USSD access)
`);
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
}

register();

const db = require('../models');
const smsService = require('../services/smsService');
const paystackService = require('../services/paystackService');
const pinService = require('../services/pinService');
const sessionStore = require('../services/ussdSessionStore');
const { sanitizeUssdInput, isValidGhanaCard, isValidPin } = require('../middleware/security');

const CON = (text) => `CON ${text}`;
const END = (text) => `END ${text}`;

function getCommissionPercent() {
  const pct = parseFloat(process.env.FARMWALLET_COMMISSION_PERCENT || '2');
  return isNaN(pct) || pct < 0 ? 0 : Math.min(50, pct);
}

const RICE_TYPES = {
  perfumed: 'Perfumed Rice',
  brown: 'Brown Rice',
  parboiled: 'Parboiled Rice',
  jasmine: 'Jasmine Rice',
  basmati: 'Basmati Rice',
  other: 'Other Rice',
};
const RICE_KEYS = ['perfumed', 'brown', 'parboiled', 'jasmine', 'basmati', 'other'];

const BAG_SIZES = { 1: 5, 2: 25, 3: 50, 4: 100 };
const BAG_SIZE_OPTIONS = '1. 5 kg\n2. 25 kg\n3. 50 kg\n4. 100 kg';

const MAIN_MENU = `FarmWallet Rice Shops

1. Register as Shop (Ghana Card)
2. Browse Shops & Buy Rice
3. Shop Owner - Manage My Shop
4. Mechanization Services
5. Share your info
0. Exit`;

const REGIONS = ['Northern', 'Ashanti', 'Volta', 'Greater Accra', 'Eastern', 'Western', 'Upper East', 'Upper West', 'Other'];
const REGION_OPTIONS = REGIONS.map((r, i) => `${i + 1}. ${r}`).join('\n');

const MECH_SERVICE_TYPES = {
  1: 'tractor', 2: 'plowing', 3: 'threshing', 4: 'harvesting',
  5: 'seed_drill', 6: 'irrigation', 7: 'sprayer', 8: 'other',
};
const MECH_SERVICE_LABELS = {
  tractor: 'Tractor', plowing: 'Plowing', threshing: 'Threshing',
  harvesting: 'Harvesting', seed_drill: 'Seed Drill', irrigation: 'Irrigation',
  sprayer: 'Sprayer', other: 'Other',
};
const MECH_UNIT_LABELS = { per_acre: ' per acre', per_hour: '/hr', per_day: '/day', per_job: '/job' };


async function handleUSSD(req, res) {
  let sessionId, phoneNumber, text, newSession, provider, serviceCode;

  // Strip shortcode prefix from text (supports *920*72#, *384*64441#, etc.)
  const stripShortcode = (raw) => (raw || '').replace(/^\*\d+\*\d+#?/, '').replace(/^\*\d+\*\d+\*/, '').replace(/^\*/, '').trim();

  if (req.body.sessionId !== undefined) {
    sessionId = sanitizeUssdInput(String(req.body.sessionId || ''), 100);
    const raw = (req.body.phoneNumber || '').replace(/\D/g, '');
    phoneNumber = raw.startsWith('233') ? raw : (raw ? '233' + raw.slice(-9) : req.body.phoneNumber);
    serviceCode = sanitizeUssdInput(String(req.body.serviceCode || ''), 20);
    const rawText = sanitizeUssdInput(req.body.text || '');
    text = stripShortcode(rawText);
    newSession = !req.body.text;
    provider = 'africastalking';
  } else if (req.body.sessionID !== undefined) {
    sessionId = sanitizeUssdInput(String(req.body.sessionID || ''), 100);
    const raw = (req.body.msisdn || '').replace(/\D/g, '');
    phoneNumber = raw.startsWith('233') ? raw : (raw ? '233' + raw.slice(-9) : req.body.msisdn);
    const rawUserData = sanitizeUssdInput(req.body.userData || '');
    serviceCode = (rawUserData.match(/^\*\d+\*\d+#?/) || ['*384*64441#'])[0];
    text = stripShortcode(rawUserData);
    newSession = req.body.newSession === true;
    provider = 'arkesel';
  } else {
    return res.status(400).send('Invalid USSD request');
  }

  if (!sessionId || !phoneNumber) {
    return res.status(400).send('Invalid USSD request: missing sessionId or phoneNumber');
  }

  try {
    const response = await processUSSD(sessionId, phoneNumber, text, newSession, serviceCode);
    return sendResponse(res, response, provider);
  } catch (error) {
    console.error('USSD Error:', error);
    return sendResponse(res, END('Sorry, an error occurred. Please try again.'), provider);
  }
}

function sendResponse(res, response, provider) {
  if (provider === 'arkesel') {
    return res.json({
      sessionID: res.req?.body?.sessionID,
      userID: res.req?.body?.userID,
      msisdn: res.req?.body?.msisdn,
      message: response.replace(/^(CON|END)\s*/, ''),
      continueSession: response.startsWith('CON'),
    });
  }
  res.set('Content-Type', 'text/plain');
  res.send(response);
}

function getUssdChannel(serviceCode) {
  const m = (serviceCode || '').match(/\*\d+\*(\d+)/);
  return m ? m[1] : null;
}

function getUssdExtension(serviceCode) {
  const m = (serviceCode || '').match(/\*\d+\*\d+\*(\d{2,5})#?$/);
  return m ? m[1] : null;
}

async function processUSSD(sessionId, phoneNumber, text, newSession, serviceCode = '') {
  const parts = text ? text.split('*').filter(Boolean) : [];
  const choice = parts.length > 0 ? parts[parts.length - 1] : null; // Last part = user's current selection
  let session = sessionStore.get(sessionId, phoneNumber);
  if (!session) {
    session = await sessionStore.hydrate(sessionId, phoneNumber);
    if (session) sessionStore.set(sessionId, phoneNumber, session);
  }
  session = session || { step: 'menu', data: {} };
  const isShortcode = /^\*\d+\*\d+/.test(serviceCode || '');
  const channel = getUssdChannel(serviceCode); // 72=rice, 73=mechanization
  const extensionFromCode = getUssdExtension(serviceCode);
  const extension = parts.length === 1 && /^\d{2,5}$/.test(parts[0]) ? parts[0] : extensionFromCode;

  if (newSession) {
    if (channel === '73') {
      if (extension && /^\d{2}$/.test(extension)) {
        const providerCode = extension;
        const mechProvider = await db.MechanizationProvider.findOne({
          where: { provider_code: providerCode, is_active: true },
          include: [{ model: db.MechanizationService, where: { is_active: true }, required: true }],
        });
        if (mechProvider) {
          sessionStore.set(sessionId, phoneNumber, { step: 'mechanization_provider_direct', data: { providerCode, providerId: mechProvider.id } });
          return showProviderDirectServices(sessionId, phoneNumber, mechProvider);
        }
      }
      sessionStore.set(sessionId, phoneNumber, { step: 'mechanization_service_type', data: {} });
      return CON('FarmWallet Mechanization\n\nSelect service:\n1. Tractor\n2. Plowing\n3. Threshing\n4. Harvesting\n5. Seed Drill\n6. Irrigation\n7. Sprayer\n8. Other\n0. Exit');
    }
    if (channel !== '73' && extension && /^\d{2}$/.test(extension)) {
      const shopId = extension;
      const exhibitor = await db.Exhibitor.findOne({
        where: { shop_id: shopId, is_active: true },
      });
      if (exhibitor) {
        sessionStore.set(sessionId, phoneNumber, { step: 'exhibitor_shop', data: { shopId } });
        return showExhibitorShop(sessionId, phoneNumber, exhibitor, []);
      }
    }
  }

  if (newSession || !text) {
    if (session.step === 'resume_prompt') {
      return CON('Session timed out.\nContinue where you left off?\n1. Yes\n2. No - Start over');
    }
    sessionStore.set(sessionId, phoneNumber, { step: isShortcode ? 'main_menu' : 'menu', data: {} });
    return CON(isShortcode ? MAIN_MENU : MAIN_MENU);
  }

  if (session.step === 'resume_prompt') {
    if (choice === '1') {
      const { savedStep, savedData } = session.data || {};
      sessionStore.set(sessionId, phoneNumber, { step: savedStep || 'menu', data: savedData || {} });
      session = { step: savedStep, data: savedData || {} };
      if (savedStep === 'exhibitor_ghana_card') return CON('Register as Shop\n\nEnter your Ghana Card number:');
      if (savedStep === 'exhibitor_name') return CON('Enter your business/shop name:');
      if (savedStep === 'exhibitor_momo') return CON('Enter MoMo number (e.g. 0555227753):');
      if (savedStep === 'exhibitor_momo_provider') return CON('Select MoMo provider:\n1. MTN\n2. Vodafone Cash\n3. AirtelTigo');
      if (savedStep === 'exhibitor_pin_create') return CON('Create your 4-digit PIN:\n\nEnter 4-digit PIN:');
      if (savedStep === 'exhibitor_rice_type') return CON('Add rice to your shop:\n1. Perfumed\n2. Brown\n3. Parboiled\n4. Jasmine\n5. Basmati\n6. Other');
      if (savedStep === 'select_shop') {
        const exhibitors = await db.Exhibitor.findAll({ where: { is_active: true }, limit: 10 });
        if (exhibitors.length === 0) return END('No shops available.');
        const list = exhibitors.map((e, i) => `${i + 1}. Shop ${e.shop_id} - ${e.name}`).join('\n');
        return CON(`Select Shop:\n${list}\n0. Back`);
      }
      if (savedStep === 'exhibitor_shop' && savedData?.shopId) {
        const exhibitor = await db.Exhibitor.findOne({ where: { shop_id: savedData.shopId, is_active: true }, include: [db.ExhibitorInventory] });
        if (exhibitor) return showExhibitorShop(sessionId, phoneNumber, exhibitor, parts);
      }
    }
    if (choice === '2') {
      sessionStore.clearResumable(phoneNumber);
      sessionStore.set(sessionId, phoneNumber, { step: 'main_menu', data: {} });
      return CON(MAIN_MENU);
    }
    return CON('Session timed out.\nContinue where you left off?\n1. Yes\n2. No - Start over');
  }

  if (session.step === 'main_menu' || session.step === 'menu') {
    if (choice === '0') return END('Thank you. FarmWallet Rice Shops.');
    if (choice === '1') {
      sessionStore.set(sessionId, phoneNumber, { step: 'exhibitor_ghana_card', data: {} });
      return CON('Register as Shop\n\nEnter your Ghana Card number:');
    }
    if (choice === '3') {
      const exhibitor = await db.Exhibitor.findOne({ where: { phone: phoneNumber, is_active: true } });
      if (!exhibitor) {
        return END('Phone not registered as shop. Register first (option 1).');
      }
      if (!exhibitor.pin_hash) {
        sessionStore.set(sessionId, phoneNumber, { step: 'exhibitor_set_pin', data: { exhibitorId: exhibitor.id } });
        return CON('Set your 4-digit PIN for secure access:\n\nEnter 4-digit PIN:');
      }
      sessionStore.set(sessionId, phoneNumber, { step: 'exhibitor_verify_pin', data: { exhibitorId: exhibitor.id } });
      return CON('Manage My Shop\n\nEnter your 4-digit PIN:');
    }
    if (choice === '2') {
      const exhibitors = await db.Exhibitor.findAll({
        where: { is_active: true },
        limit: 10,
      });
      if (exhibitors.length === 0) {
        sessionStore.clear(sessionId, phoneNumber);
        return END('No shops available. Try again later.');
      }
      const list = exhibitors.map((e, i) => `${i + 1}. Shop ${e.shop_id} - ${e.name}`).join('\n');
      sessionStore.set(sessionId, phoneNumber, { step: 'select_shop', data: {} });
      return CON(`Select Shop:\n${list}\n0. Back`);
    }
    if (choice === '4') {
      sessionStore.set(sessionId, phoneNumber, { step: 'mechanization_service_type', data: {} });
      return CON('Mechanization Services\n\nSelect service:\n1. Tractor\n2. Plowing\n3. Threshing\n4. Harvesting\n5. Seed Drill\n6. Irrigation\n7. Sprayer\n8. Other\n0. Back');
    }
    if (choice === '5') {
      sessionStore.set(sessionId, phoneNumber, { step: 'data_submit_name', data: {} });
      return CON('Share your info\n\nNo registration needed.\n\nEnter your name:');
    }
    return CON('Invalid option.\n\n' + MAIN_MENU);
  }

  if (session.step === 'data_submit_name') {
    const name = sanitizeUssdInput(choice || '', 100);
    if (!name) return CON('Share your info\n\nEnter your name:');
    session.data.name = name;
    session.step = 'data_submit_region';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON(`Select your region:\n${REGION_OPTIONS}\n0. Skip`);
  }

  if (session.step === 'data_submit_region') {
    if (choice === '0') {
      session.data.region = null;
    } else {
      const idx = parseInt(choice, 10);
      if (idx >= 1 && idx <= REGIONS.length) session.data.region = REGIONS[idx - 1];
    }
    session.step = 'data_submit_interest';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('What brings you to FarmWallet?\n1. Farmer\n2. Buyer\n3. Both\n4. Just browsing\n0. Skip');
  }

  if (session.step === 'data_submit_interest') {
    const interestMap = { 1: 'farmer', 2: 'buyer', 3: 'both', 4: 'browsing' };
    if (choice !== '0') session.data.interest = interestMap[choice] || null;
    session.step = 'data_submit_farm_size';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Farm size in acres?\nEnter number or 0 to skip:');
  }

  if (session.step === 'data_submit_farm_size') {
    const acres = parseFloat(choice);
    if (!isNaN(acres) && acres >= 0) session.data.farm_size_acres = acres === 0 ? null : acres;
    try {
      await db.DataSubmission.create({
        phone_number: phoneNumber,
        submission_type: 'user_info',
        data: session.data,
        source: 'ussd',
      });
    } catch (err) {
      console.warn('DataSubmission create failed:', err.message);
    }
    sessionStore.clear(sessionId, phoneNumber);
    return END('Thank you! Your info has been saved. FarmWallet Rice Shops.');
  }

  if (session.step === 'mechanization_provider_direct') {
    if (choice === '0') {
      sessionStore.clear(sessionId, phoneNumber);
      return END('Thank you. FarmWallet Mechanization.');
    }
    const provider = await db.MechanizationProvider.findByPk(session.data.providerId, {
      include: [{ model: db.MechanizationService, where: { is_active: true, verification_status: 'verified' } }],
    });
    if (!provider || provider.MechanizationServices.length === 0) {
      sessionStore.clear(sessionId, phoneNumber);
      return END('Provider not found or no services.');
    }
    const idx = parseInt(choice, 10);
    if (isNaN(idx) || idx < 1 || idx > provider.MechanizationServices.length) {
      return showProviderDirectServices(sessionId, phoneNumber, provider);
    }
    const svc = provider.MechanizationServices[idx - 1];
    session.data.mech_service = { id: svc.id, provider_id: svc.provider_id, price_per_unit: Number(svc.price_per_unit), unit: svc.unit, service_type: svc.service_type, tractor_registration_number: svc.tractor_registration_number };
    session.data.mech_provider = { name: provider.name, phone: provider.phone, momo_number: provider.momo_number || provider.phone, region: provider.region };
    session.step = 'mechanization_acres';
    sessionStore.set(sessionId, phoneNumber, session);
    if (svc.unit !== 'per_acre') {
      const unitLabel = MECH_UNIT_LABELS[svc.unit] || '';
      const regLine = svc.tractor_registration_number ? `Reg: ${svc.tractor_registration_number}\n` : '';
      sessionStore.clear(sessionId, phoneNumber);
      return END(`${MECH_SERVICE_LABELS[svc.service_type] || svc.service_type}\n${provider.name}\n${regLine}${provider.region ? provider.region + '\n' : ''}GHS ${svc.price_per_unit}${unitLabel}\n\nCall: ${provider.momo_number || provider.phone}\n\nFarmWallet`);
    }
    const regLine = svc.tractor_registration_number ? `Reg: ${svc.tractor_registration_number}\n` : '';
    return CON(`${MECH_SERVICE_LABELS[svc.service_type] || svc.service_type}\n${provider.name}\n${regLine}GHS ${svc.price_per_unit} per acre\n\nHow many acres?\nEnter number of acres:`);
  }

  if (session.step === 'mechanization_service_type') {
    if (choice === '0') {
      sessionStore.set(sessionId, phoneNumber, { step: 'main_menu', data: {} });
      return CON(MAIN_MENU);
    }
    const svcType = MECH_SERVICE_TYPES[choice];
    if (!svcType) return CON('Select 1-8:\n1. Tractor\n2. Plowing\n3. Threshing\n4. Harvesting\n5. Seed Drill\n6. Irrigation\n7. Sprayer\n8. Other\n0. Back');
    session.data.mech_service_type = svcType;
    session.step = 'mechanization_providers';
    sessionStore.set(sessionId, phoneNumber, session);
    return showMechanizationProviders(sessionId, phoneNumber, svcType);
  }

  if (session.step === 'mechanization_providers') {
    if (choice === '0') {
      sessionStore.set(sessionId, phoneNumber, { step: 'mechanization_service_type', data: {} });
      return CON('Mechanization Services\n\nSelect service:\n1. Tractor\n2. Plowing\n3. Threshing\n4. Harvesting\n5. Seed Drill\n6. Irrigation\n7. Sprayer\n8. Other\n0. Back');
    }
    const services = await db.MechanizationService.findAll({
      where: { service_type: session.data.mech_service_type, is_active: true, verification_status: 'verified' },
      include: [{ model: db.MechanizationProvider, where: { is_active: true }, attributes: ['id', 'name', 'phone', 'momo_number', 'region'] }],
    });
    const idx = parseInt(choice, 10);
    if (isNaN(idx) || idx < 1 || idx > services.length) return showMechanizationProviders(sessionId, phoneNumber, session.data.mech_service_type);
    const svc = services[idx - 1];
    session.data.mech_service = { id: svc.id, provider_id: svc.provider_id, price_per_unit: Number(svc.price_per_unit), unit: svc.unit, service_type: svc.service_type, tractor_registration_number: svc.tractor_registration_number };
    session.data.mech_provider = { name: svc.MechanizationProvider.name, phone: svc.MechanizationProvider.phone, momo_number: svc.MechanizationProvider.momo_number, region: svc.MechanizationProvider.region };
    const provider = svc.MechanizationProvider;
    const contact = provider.momo_number || provider.phone;
    if (svc.unit !== 'per_acre') {
      const unitLabel = MECH_UNIT_LABELS[svc.unit] || '';
      const regLine = svc.tractor_registration_number ? `Reg: ${svc.tractor_registration_number}\n` : '';
      sessionStore.clear(sessionId, phoneNumber);
      return END(`${MECH_SERVICE_LABELS[svc.service_type] || svc.service_type}\n${provider.name}\n${regLine}${provider.region ? provider.region + '\n' : ''}GHS ${svc.price_per_unit}${unitLabel}\n\nCall: ${contact}\n\nFarmWallet`);
    }
    session.step = 'mechanization_acres';
    sessionStore.set(sessionId, phoneNumber, session);
    const regLine = svc.tractor_registration_number ? `Reg: ${svc.tractor_registration_number}\n` : '';
    return CON(`${MECH_SERVICE_LABELS[svc.service_type] || svc.service_type}\n${provider.name}\n${regLine}GHS ${svc.price_per_unit} per acre\n\nHow many acres?\nEnter number of acres:`);
  }

  if (session.step === 'mechanization_acres') {
    const acres = parseFloat(choice);
    if (isNaN(acres) || acres < 0.1 || acres > 999) return CON('Enter valid acres (e.g. 2 or 5.5):');
    const svc = session.data.mech_service;
    const provider = session.data.mech_provider;
    const total = (svc.price_per_unit * acres).toFixed(2);
    const contact = provider.momo_number || provider.phone;
    const regLine = svc.tractor_registration_number ? `Reg: ${svc.tractor_registration_number}\n` : '';
    sessionStore.clear(sessionId, phoneNumber);
    return END(`${MECH_SERVICE_LABELS[svc.service_type] || svc.service_type}\n${provider.name}\n${regLine}${provider.region ? provider.region + '\n' : ''}${acres} acre(s) x GHS ${svc.price_per_unit}/acre\n= GHS ${total} total\n\nCall: ${contact}\n\nFarmWallet`);
  }

  if (session.step === 'select_shop' || (parts.length === 2 && parts[0] === '2')) {
    if (choice === '0') {
      sessionStore.set(sessionId, phoneNumber, { step: 'main_menu', data: {} });
      return CON(MAIN_MENU);
    }
    const exhibitors = await db.Exhibitor.findAll({
      where: { is_active: true },
      limit: 10,
    });
    const idx = parseInt(choice, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= exhibitors.length) {
      const exhibitor = exhibitors[idx - 1];
      sessionStore.set(sessionId, phoneNumber, { step: 'exhibitor_shop', data: { shopId: exhibitor.shop_id } });
      return showExhibitorShop(sessionId, phoneNumber, exhibitor, []);
    }
    if (exhibitors.length === 0) {
      sessionStore.set(sessionId, phoneNumber, { step: 'main_menu', data: {} });
      return END('No shops available. Try again later.');
    }
    const list = exhibitors.map((e, i) => `${i + 1}. Shop ${e.shop_id} - ${e.name}`).join('\n');
    return CON(`Invalid. Select 1-${exhibitors.length}:\n${list}\n0. Back`);
  }

  if (session.step === 'exhibitor_shop' || (parts.length >= 3 && parts[0] === '2')) {
    let exhibitor = session.data.shopId
      ? await db.Exhibitor.findOne({ where: { shop_id: session.data.shopId, is_active: true }, include: [db.ExhibitorInventory] })
      : null;
    if (!exhibitor && parts.length >= 2) {
      const exhibitors = await db.Exhibitor.findAll({ where: { is_active: true }, limit: 10 });
      const shopIdx = parseInt(parts[1], 10);
      if (!isNaN(shopIdx) && shopIdx >= 1 && shopIdx <= exhibitors.length) {
        exhibitor = exhibitors[shopIdx - 1];
        session.data.shopId = exhibitor.shop_id;
      }
    }
    if (!exhibitor) {
      sessionStore.clear(sessionId, phoneNumber);
      return END('Shop not found.');
    }
    session.step = 'exhibitor_shop';
    sessionStore.set(sessionId, phoneNumber, session);
    return handleExhibitorShopInput(sessionId, phoneNumber, exhibitor, parts, session);
  }

  if (session.step === 'exhibitor_ghana_card') {
    const ghanaCard = sanitizeUssdInput(choice || '', 20);
    if (!isValidGhanaCard(ghanaCard)) return CON('Enter valid Ghana Card (8-20 chars):');
    session.data.ghana_card = ghanaCard;
    session.step = 'exhibitor_name';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Enter your business/shop name:');
  }

  if (session.step === 'exhibitor_name') {
    session.data.name = sanitizeUssdInput(choice || '', 100);
    if (!session.data.name) return CON('Enter your business/shop name:');
    session.step = 'exhibitor_momo';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Enter MoMo number (e.g. 0555227753):');
  }

  if (session.step === 'exhibitor_momo') {
    const raw = (choice || '').replace(/\D/g, '');
    const momo = raw.startsWith('233') ? '0' + raw.slice(-9) : (raw.length >= 10 ? raw.slice(-10) : '0' + raw);
    if (momo.length < 10) return CON('Enter valid MoMo number:');
    session.data.momo = momo;
    session.step = 'exhibitor_momo_provider';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Select MoMo provider:\n1. MTN\n2. Vodafone Cash\n3. AirtelTigo');
  }

  if (session.step === 'exhibitor_momo_provider') {
    const providerMap = { 1: 'mtn', 2: 'vodafone', 3: 'airteltigo' };
    session.data.momo_provider = providerMap[choice];
    if (!session.data.momo_provider) return CON('Select 1-3:\n1. MTN\n2. Vodafone\n3. AirtelTigo');
    session.data.exhibition_day = 1; // Legacy field; kept for DB compatibility
    session.step = 'exhibitor_pin_create';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Create your 4-digit PIN for secure access:\n\nEnter 4-digit PIN:');
  }

  if (session.step === 'exhibitor_pin_create') {
    const pin = (choice || '').trim();
    if (!isValidPin(pin)) return CON('Enter a valid 4-digit PIN:');
    session.data.pin_temp = pin;
    session.step = 'exhibitor_pin_confirm';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Confirm your 4-digit PIN:\n\nRe-enter PIN:');
  }

  if (session.step === 'exhibitor_pin_confirm') {
    const pin = (choice || '').trim();
    if (pin !== session.data.pin_temp) {
      session.step = 'exhibitor_pin_create';
      session.data.pin_temp = undefined;
      sessionStore.set(sessionId, phoneNumber, session);
      return CON('PINs do not match. Enter 4-digit PIN again:');
    }
    session.data.pin_hash = await pinService.hashPin(pin);
    session.data.pin_temp = undefined;
    session.step = 'exhibitor_rice_type';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Add rice to your shop:\n1. Perfumed\n2. Brown\n3. Parboiled\n4. Jasmine\n5. Basmati\n6. Other');
  }

  if (session.step === 'exhibitor_set_pin') {
    const pin = (choice || '').trim();
    if (!isValidPin(pin)) return CON('Enter a valid 4-digit PIN:');
    session.data.pin_temp = pin;
    session.step = 'exhibitor_set_pin_confirm';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Confirm your 4-digit PIN:\n\nRe-enter PIN:');
  }

  if (session.step === 'exhibitor_set_pin_confirm') {
    const pin = (choice || '').trim();
    if (pin !== session.data.pin_temp) {
      session.step = 'exhibitor_set_pin';
      session.data.pin_temp = undefined;
      sessionStore.set(sessionId, phoneNumber, session);
      return CON('PINs do not match. Enter 4-digit PIN again:');
    }
    const exhibitor = await db.Exhibitor.findByPk(session.data.exhibitorId);
    if (exhibitor) {
      exhibitor.pin_hash = await pinService.hashPin(pin);
      await exhibitor.save();
    }
    session.data.pin_temp = undefined;
    session.step = 'exhibitor_manage_menu';
    session.data.exhibitorId = exhibitor?.id;
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('PIN set! Manage your shop:\n1. Add rice to inventory\n2. Back');
  }

  if (session.step === 'exhibitor_verify_pin') {
    const exhibitor = await db.Exhibitor.findByPk(session.data.exhibitorId);
    if (!exhibitor || !exhibitor.pin_hash) {
      sessionStore.clear(sessionId, phoneNumber);
      return END('Shop not found.');
    }
    const pin = (choice || '').trim();
    if (!isValidPin(pin)) return CON('Enter your 4-digit PIN:');
    const valid = await pinService.verifyPin(pin, exhibitor.pin_hash);
    if (!valid) {
      session.data.pin_attempts = (session.data.pin_attempts || 0) + 1;
      if (session.data.pin_attempts >= 3) {
        sessionStore.clear(sessionId, phoneNumber);
        return END('Too many wrong PINs. Try again later.');
      }
      sessionStore.set(sessionId, phoneNumber, session);
      return CON(`Wrong PIN. Try again (${3 - session.data.pin_attempts} left):`);
    }
    session.data.pin_attempts = 0;
    session.step = 'exhibitor_manage_menu';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Manage your shop:\n1. Add rice to inventory\n2. Back');
  }

  if (session.step === 'exhibitor_manage_menu') {
    if (choice === '2') {
      sessionStore.set(sessionId, phoneNumber, { step: 'main_menu', data: {} });
      return CON(MAIN_MENU);
    }
    if (choice === '1') {
      session.data.fromManage = true;
      session.step = 'exhibitor_rice_type';
      sessionStore.set(sessionId, phoneNumber, session);
      return CON('Add rice to your shop:\n1. Perfumed\n2. Brown\n3. Parboiled\n4. Jasmine\n5. Basmati\n6. Other');
    }
    return CON('Select 1 or 2:\n1. Add rice to inventory\n2. Back');
  }

  if (session.step === 'exhibitor_rice_type') {
    const riceMap = { 1: 'perfumed', 2: 'brown', 3: 'parboiled', 4: 'jasmine', 5: 'basmati', 6: 'other' };
    session.data.rice_type = riceMap[choice];
    if (!session.data.rice_type) return CON('Select 1-6.');
    session.step = 'exhibitor_bag_size';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON(`Bag size (kg):\n${BAG_SIZE_OPTIONS}`);
  }

  if (session.step === 'exhibitor_bag_size') {
    const kg = BAG_SIZES[choice];
    if (!kg) return CON(`Select 1-4:\n${BAG_SIZE_OPTIONS}`);
    session.data.bag_size_kg = kg;
    session.step = 'exhibitor_qty';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Enter quantity (bags):');
  }

  if (session.step === 'exhibitor_qty') {
    const qty = parseInt(choice, 10);
    if (isNaN(qty) || qty < 1) return CON('Enter valid quantity:');
    session.data.quantity = qty;
    session.step = 'exhibitor_price';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Enter price per bag (GHS):');
  }

  if (session.step === 'exhibitor_price') {
    const price = parseFloat(choice);
    if (isNaN(price) || price <= 0) return CON('Enter valid price:');
    session.data.price = price;

    let exhibitor;
    if (session.data.exhibitorId) {
      exhibitor = await db.Exhibitor.findByPk(session.data.exhibitorId);
      await db.ExhibitorInventory.create({
        exhibitor_id: exhibitor.id,
        rice_type: session.data.rice_type,
        bag_size_kg: session.data.bag_size_kg || 50,
        quantity: session.data.quantity,
        price_per_bag: session.data.price,
        verification_status: 'pending',
      });
      session.step = 'exhibitor_add_more';
      sessionStore.set(sessionId, phoneNumber, session);
      return CON('Rice added! (Pending admin verification)\n\nAdd another rice type?\n1. Yes\n2. No - Finish');
    }

    const count = await db.Exhibitor.count();
    const nextShopId = String(count + 1).padStart(2, '0');
    exhibitor = await db.Exhibitor.create({
      shop_id: nextShopId,
      ghana_card: session.data.ghana_card,
      name: session.data.name,
      phone: phoneNumber,
      momo_number: session.data.momo,
      momo_provider: session.data.momo_provider,
      exhibition_day: session.data.exhibition_day,
      pin_hash: session.data.pin_hash,
    });
    await db.ExhibitorInventory.create({
      exhibitor_id: exhibitor.id,
      rice_type: session.data.rice_type,
      bag_size_kg: session.data.bag_size_kg || 50,
      quantity: session.data.quantity,
      price_per_bag: session.data.price,
      verification_status: 'pending',
    });

    session.data.exhibitorId = exhibitor.id;
    session.step = 'exhibitor_add_more';
    sessionStore.set(sessionId, phoneNumber, session);
    return CON('Shop created! Add another rice type?\n1. Yes\n2. No - Finish');
  }

  if (session.step === 'exhibitor_add_more') {
    if (choice === '1') {
      session.step = 'exhibitor_rice_type';
      session.data.rice_type = undefined;
      session.data.bag_size_kg = undefined;
      sessionStore.set(sessionId, phoneNumber, session);
      return CON('Add rice:\n1. Perfumed\n2. Brown\n3. Parboiled\n4. Jasmine\n5. Basmati\n6. Other');
    }
    if (choice === '2') {
      const exhibitor = await db.Exhibitor.findByPk(session.data.exhibitorId);
      if (session.data.fromManage) {
        session.step = 'exhibitor_manage_menu';
        session.data.fromManage = undefined;
        sessionStore.set(sessionId, phoneNumber, session);
        return CON('Rice added! (Pending admin verification)\n\nManage your shop:\n1. Add rice to inventory\n2. Back');
      }
      smsService.sendShopConfirmation(phoneNumber, exhibitor.shop_id, exhibitor.name);
      sessionStore.clearResumable(phoneNumber);
      sessionStore.clear(sessionId, phoneNumber);
      return END(`Shop ready!\n\nShop ID: ${exhibitor.shop_id}\nDial *920*72*${exhibitor.shop_id}#\nSMS sent.`);
    }
    return CON('Select 1 or 2:\n1. Yes - Add more rice\n2. No - Finish');
  }

  sessionStore.set(sessionId, phoneNumber, { step: 'main_menu', data: {} });
  return CON(MAIN_MENU);
}

async function showProviderDirectServices(sessionId, phoneNumber, provider) {
  const services = provider.MechanizationServices || [];
  if (services.length === 0) {
    sessionStore.clear(sessionId, phoneNumber);
    return END(`${provider.name} - No services available.`);
  }
  const lines = services.map((s, i) => {
    const unit = s.unit === 'per_acre' ? ' per acre' : MECH_UNIT_LABELS[s.unit] || '';
    return `${i + 1}. ${MECH_SERVICE_LABELS[s.service_type] || s.service_type} - GHS ${s.price_per_unit}${unit}`;
  });
  const current = sessionStore.get(sessionId, phoneNumber);
  sessionStore.set(sessionId, phoneNumber, { ...current, step: 'mechanization_provider_direct', data: { ...(current?.data || {}), providerCode: provider.provider_code, providerId: provider.id } });
  return CON(`${provider.name}\nProvider ${provider.provider_code || ''}\n\n${lines.join('\n')}\n\nSelect service (1-${services.length}):\n0. Exit`);
}

async function showMechanizationProviders(sessionId, phoneNumber, serviceType) {
  const services = await db.MechanizationService.findAll({
    where: { service_type: serviceType, is_active: true, verification_status: 'verified' },
    include: [{ model: db.MechanizationProvider, where: { is_active: true }, attributes: ['id', 'name', 'phone', 'region'] }],
    limit: 10,
  });
  if (services.length === 0) {
    sessionStore.clear(sessionId, phoneNumber);
    return END(`No ${MECH_SERVICE_LABELS[serviceType] || serviceType} providers found. Try another service.`);
  }
  const lines = services.map((s, i) => {
    const p = s.MechanizationProvider;
    const unit = s.unit === 'per_acre' ? ' per acre' : MECH_UNIT_LABELS[s.unit] || '';
    return `${i + 1}. ${p.name}${p.region ? ` (${p.region})` : ''} - GHS ${s.price_per_unit}${unit}`;
  });
  const current = sessionStore.get(sessionId, phoneNumber);
  sessionStore.set(sessionId, phoneNumber, { ...current, step: 'mechanization_providers', data: { ...(current?.data || {}), mech_service_type: serviceType } });
  return CON(`${MECH_SERVICE_LABELS[serviceType] || serviceType} Providers\n\n${lines.join('\n')}\n\nSelect provider (1-${services.length}):\n0. Back`);
}

async function showExhibitorShop(sessionId, phoneNumber, exhibitor, parts) {
  const items = await db.ExhibitorInventory.findAll({
    where: { exhibitor_id: exhibitor.id, quantity: { [db.Sequelize.Op.gt]: 0 }, verification_status: 'verified' },
  });
  if (items.length === 0) {
    sessionStore.clear(sessionId, phoneNumber);
    return END(`${exhibitor.name} - No rice in stock.`);
  }
  const bagLabel = (item) => (item.bag_size_kg ? `${item.bag_size_kg}kg` : '');
  const lines = items.map((item, i) =>
    `${i + 1}. ${RICE_TYPES[item.rice_type] || item.rice_type}${bagLabel(item) ? ` (${bagLabel(item)})` : ''} - ${item.quantity} bags @ GHS ${item.price_per_bag}`
  );
  const current = sessionStore.get(sessionId, phoneNumber);
  sessionStore.set(sessionId, phoneNumber, { step: 'exhibitor_shop', data: { ...(current?.data || {}), shopId: exhibitor.shop_id } });
  return CON(`${exhibitor.name} - Shop ${exhibitor.shop_id}\n\n${lines.join('\n')}\n\nSelect rice (1-${items.length}):`);
}

async function handleExhibitorShopInput(sessionId, phoneNumber, exhibitor, parts, session) {
  const shopChoice = parts.length > 0 ? parts[parts.length - 1] : null;
  const items = await db.ExhibitorInventory.findAll({
    where: { exhibitor_id: exhibitor.id, quantity: { [db.Sequelize.Op.gt]: 0 }, verification_status: 'verified' },
  });
  if (items.length === 0) return END('No stock.');

  if (session.data.selectedItem === undefined) {
    const idx = parseInt(shopChoice, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) return showExhibitorShop(sessionId, phoneNumber, exhibitor, parts);
    session.data.selectedItem = idx - 1;
    session.data.itemId = items[idx - 1].id;
    session.data.quantity = undefined;
    session.data.amount = undefined;
    sessionStore.set(sessionId, phoneNumber, session);
    const sel = items[idx - 1];
    const bagInfo = sel.bag_size_kg ? ` (${sel.bag_size_kg} kg)` : '';
    return CON(`${RICE_TYPES[sel.rice_type] || sel.rice_type}${bagInfo}\nPrice: GHS ${sel.price_per_bag}/bag\n\nEnter quantity (max ${sel.quantity} bags):`);
  }

  if (session.data.quantity === undefined) {
    const qty = parseInt(shopChoice, 10);
    const item = items[session.data.selectedItem];
    if (isNaN(qty) || qty < 1 || qty > item.quantity) return CON(`Enter 1-${item.quantity}:\n\n${RICE_TYPES[item.rice_type]}${item.bag_size_kg ? ` (${item.bag_size_kg}kg)` : ''} @ GHS ${item.price_per_bag}/bag`);
    const amount = Number(item.price_per_bag) * qty;
    session.data.quantity = qty;
    session.data.amount = amount;
    sessionStore.set(sessionId, phoneNumber, session);
    return CON(`${qty} bags x GHS ${item.price_per_bag} = GHS ${amount.toFixed(2)}\n\nPay with Mobile Money\nSelect provider:\n1. MTN\n2. Vodafone\n3. AirtelTigo\n0. Cancel`);
  }

  const providerMap = { 1: 'mtn', 2: 'vodafone', 3: 'airteltigo' };
  const buyerProvider = providerMap[shopChoice];
  if (!buyerProvider) {
    if (shopChoice === '0') {
      session.data.selectedItem = undefined;
      session.data.quantity = undefined;
      session.data.amount = undefined;
      sessionStore.set(sessionId, phoneNumber, session);
      return showExhibitorShop(sessionId, phoneNumber, exhibitor, parts);
    }
    return CON(`${session.data.quantity} bags = GHS ${session.data.amount.toFixed(2)}\n\nSelect provider:\n1. MTN\n2. Vodafone\n3. AirtelTigo\n0. Cancel`);
  }

  const qty = session.data.quantity;
  const amount = session.data.amount;
  const item = items[session.data.selectedItem];
  const commissionPercent = getCommissionPercent();
  const farmwalletCommission = (amount * commissionPercent) / 100;
  const exhibitorReceives = amount - farmwalletCommission;

  const sale = await db.Sale.create({
    exhibitor_id: exhibitor.id,
    buyer_phone: phoneNumber,
    rice_type: item.rice_type,
    bag_size_kg: item.bag_size_kg || 50,
    quantity: qty,
    amount,
    farmwallet_commission: farmwalletCommission,
    commission_percent: commissionPercent,
    momo_status: 'initiated',
    momo_reference: `SALE-${Date.now()}`,
  });

  await item.update({ quantity: item.quantity - qty });

  const paymentResult = await paystackService.initiatePayment(phoneNumber, amount, sale.momo_reference, buyerProvider);

  if (!paymentResult.success) {
    await item.update({ quantity: item.quantity + qty });
    await sale.update({ momo_status: 'failed' });
    sessionStore.clear(sessionId, phoneNumber);
    return END(`Payment failed.\n${paymentResult.message}\n\nTry again or use another MoMo wallet.`);
  }

  if (paymentResult.transactionId) {
    await sale.update({ mtn_reference: paymentResult.transactionId });
  }

  smsService.sendSaleConfirmation(phoneNumber, exhibitor.name, exhibitor.momo_number, qty, amount);
  sessionStore.clear(sessionId, phoneNumber);
  const commissionNote = commissionPercent > 0 ? `\n(FarmWallet ${commissionPercent}% commission: GHS ${farmwalletCommission.toFixed(2)})` : '';
  return END(`Order confirmed!\n${qty} bags = GHS ${amount.toFixed(2)}\nMoMo prompt sent.\nComplete payment on your phone.\nShop receives GHS ${exhibitorReceives.toFixed(2)}.${commissionNote}`);
}

module.exports = { handleUSSD };

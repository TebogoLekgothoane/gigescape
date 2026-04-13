/**
 * CultivatedText — Express server
 * Static frontend, POST /api/lead, PayFast checkout init + ITN webhook.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const querystring = require('querystring');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const {
  generateSignature,
  validateItnSignature,
  isAllowedPayFastIp,
  confirmItnWithPayFast,
} = require('./lib/payfast');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

const STATUS_OPTIONS = ['Student', 'Graduate', 'Job Seeker', 'Contractor'];

/** ZAR amount for the Quick-Win Kit — must match PayFast button & ITN checks */
const PAYFAST_ITEM_AMOUNT = process.env.PAYFAST_ITEM_AMOUNT || '1000.00';
const PAYFAST_ITEM_NAME = process.env.PAYFAST_ITEM_NAME || 'AI Resume Quick-Win Kit';

function sanitizeString(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, maxLen)
    .replace(/[<>'"&]/g, '');
}

function normalizeLead(lead) {
  return {
    ...lead,
    paid: lead.paid === true,
    paymentId: lead.paymentId != null ? lead.paymentId : null,
    paymentAmount: lead.paymentAmount != null ? lead.paymentAmount : null,
    paidAt: lead.paidAt != null ? lead.paidAt : null,
  };
}

function readLeads() {
  try {
    const raw = fs.readFileSync(LEADS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeLead);
  } catch {
    return [];
  }
}

function writeLeads(leads) {
  fs.writeFileSync(LEADS_FILE, `${JSON.stringify(leads, null, 2)}\n`, 'utf8');
}

function getBaseUrl() {
  const b = process.env.BASE_URL || `http://localhost:${PORT}`;
  return String(b).replace(/\/$/, '');
}

function payfastProcessUrl() {
  const sandbox = process.env.PAYFAST_SANDBOX !== 'false';
  return sandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';
}

function payfastValidateUrl() {
  const sandbox = process.env.PAYFAST_SANDBOX !== 'false';
  return sandbox
    ? 'https://sandbox.payfast.co.za/eng/query/validate'
    : 'https://www.payfast.co.za/eng/query/validate';
}

const app = express();

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

const payfastInitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/payfast/itn — MUST be registered before any global urlencoded parser.
 * Raw body is re-posted to PayFast /eng/query/validate unchanged.
 */
function isPayFastFormUrlEncoded(req) {
  const ct = req.headers['content-type'] || '';
  return /application\/x-www-form-urlencoded/i.test(ct);
}

app.post(
  '/api/payfast/itn',
  express.raw({ type: isPayFastFormUrlEncoded, limit: '256kb' }),
  (req, res, next) => {
    const raw = req.body.toString('utf8');
    req.payfastRawBody = raw;
    req.body = querystring.parse(raw);
    next();
  },
  async (req, res) => {
    const merchantId = process.env.MERCHANT_ID;
    const passphrase = process.env.PASSPHRASE || '';

    if (!merchantId || !process.env.MERCHANT_KEY) {
      console.error('[payfast itn] Missing MERCHANT_ID / MERCHANT_KEY');
      return res.status(503).send('CONFIG');
    }

    const remoteIp =
      req.ip ||
      (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
      req.socket.remoteAddress;

    const skipIp = process.env.SKIP_PAYFAST_IP_CHECK === 'true';
    if (
      !isAllowedPayFastIp(remoteIp, process.env.PAYFAST_ALLOWED_ITN_IPS, skipIp)
    ) {
      console.warn('[payfast itn] Rejected IP:', remoteIp);
      return res.status(403).send('FORBIDDEN');
    }

    const data = req.body;
    if (!validateItnSignature(data, passphrase)) {
      console.warn('[payfast itn] Invalid signature');
      return res.status(400).send('INVALID_SIG');
    }

    if (String(data.merchant_id) !== String(merchantId)) {
      console.warn('[payfast itn] merchant_id mismatch');
      return res.status(400).send('BAD_MERCHANT');
    }

    const gross = String(data.amount_gross != null ? data.amount_gross : '').trim();
    if (gross !== PAYFAST_ITEM_AMOUNT) {
      console.warn('[payfast itn] amount mismatch', gross, 'expected', PAYFAST_ITEM_AMOUNT);
      return res.status(400).send('BAD_AMOUNT');
    }

    const status = String(data.payment_status || '').toUpperCase();
    if (status !== 'COMPLETE') {
      console.log('[payfast itn] Non-complete status:', data.payment_status);
      return res.status(200).send('OK');
    }

    let serverValid = false;
    try {
      serverValid = await confirmItnWithPayFast(req.payfastRawBody, payfastValidateUrl());
    } catch (e) {
      console.error('[payfast itn] validate fetch failed', e);
      return res.status(502).send('VALIDATE_FAIL');
    }

    if (!serverValid) {
      console.warn('[payfast itn] PayFast server did not return VALID');
      return res.status(400).send('NOT_VALID');
    }

    const email = String(data.email_address || '')
      .toLowerCase()
      .trim();
    const pfPaymentId = String(data.pf_payment_id || data.m_payment_id || '');

    let leads = readLeads();
    const idx = leads.findIndex((l) => String(l.email).toLowerCase() === email);
    if (idx === -1) {
      console.log('[payfast itn] No lead for email; recording payment only in log:', email);
    } else {
      leads[idx] = {
        ...leads[idx],
        paid: true,
        paymentId: pfPaymentId,
        paymentAmount: gross,
        paidAt: new Date().toISOString(),
      };
      try {
        writeLeads(leads);
      } catch (err) {
        console.error('[payfast itn] write error', err);
        return res.status(500).send('STORE_FAIL');
      }
    }

    console.log(
      `[payfast itn] Payment COMPLETE for ${email} pf_payment_id=${pfPaymentId} amount=${gross}`
    );
    return res.status(200).send('OK');
  }
);

app.use(express.json({ limit: '32kb' }));

app.post(
  '/api/lead',
  leadLimiter,
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required.')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters.'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required.')
      .isEmail()
      .withMessage('Please enter a valid email address.')
      .normalizeEmail(),
    body('status')
      .trim()
      .notEmpty()
      .withMessage('Status is required.')
      .isIn(STATUS_OPTIONS)
      .withMessage('Invalid status selection.'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: errors.array().map((e) => ({ field: e.path, msg: e.msg })),
      });
    }

    const name = sanitizeString(req.body.name, 100);
    const email = String(req.body.email).toLowerCase().trim();
    const status = sanitizeString(req.body.status, 40);

    if (!STATUS_OPTIONS.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    let leads;
    try {
      leads = readLeads();
    } catch (err) {
      console.error('[lead] read error', err);
      return res.status(500).json({ success: false, message: 'Could not read data store.' });
    }

    const duplicate = leads.some((l) => String(l.email).toLowerCase() === email);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_EMAIL',
        message: 'This email is already registered. Check your inbox or use another address.',
      });
    }

    const lead = {
      id: crypto.randomUUID(),
      name,
      email,
      status,
      createdAt: new Date().toISOString(),
      paid: false,
      paymentId: null,
      paymentAmount: null,
      paidAt: null,
    };

    leads.push(lead);

    try {
      writeLeads(leads);
    } catch (err) {
      console.error('[lead] write error', err);
      return res.status(500).json({ success: false, message: 'Could not save your details. Please try again.' });
    }

    console.log(`Lead magnet sent to ${email}`);

    return res.status(201).json({
      success: true,
      message: 'Thank you. Your details were saved.',
    });
  }
);

/**
 * POST /api/payfast/init — build signed fields for browser to POST to PayFast (passphrase stays server-side).
 */
app.post(
  '/api/payfast/init',
  payfastInitLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email required.').normalizeEmail(),
    body('name_first').optional().trim().isLength({ max: 80 }),
    body('name_last').optional().trim().isLength({ max: 80 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const merchantId = process.env.MERCHANT_ID;
    const merchantKey = process.env.MERCHANT_KEY;
    const passphrase = process.env.PASSPHRASE || '';

    if (!merchantId || !merchantKey) {
      return res.status(503).json({
        success: false,
        message: 'Payment is not configured. Set MERCHANT_ID and MERCHANT_KEY in environment.',
      });
    }

    const email = String(req.body.email).toLowerCase().trim();
    const nameFirst = sanitizeString(req.body.name_first || 'Customer', 80);
    const nameLast = sanitizeString(req.body.name_last || '', 80);
    const base = getBaseUrl();

    const paymentFields = {
      merchant_id: String(merchantId),
      merchant_key: String(merchantKey),
      return_url: `${base}/payment-success.html`,
      cancel_url: `${base}/payment-cancel.html`,
      notify_url: `${base}/api/payfast/itn`,
      name_first: nameFirst,
      name_last: nameLast,
      email_address: email,
      m_payment_id: crypto.randomUUID(),
      amount: PAYFAST_ITEM_AMOUNT,
      item_name: PAYFAST_ITEM_NAME,
      item_description: 'CultivatedText — digital download + coaching',
    };

    const signature = generateSignature(paymentFields, passphrase);

    return res.json({
      success: true,
      action: payfastProcessUrl(),
      fields: {
        ...paymentFields,
        signature,
      },
    });
  }
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'cultivatedtext-api' });
});

/** Explicit payment result pages — avoids edge cases where static serving 404s on some hosts. */
function sendFrontendHtml(fileName) {
  return (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, fileName), (err) => {
      if (err) {
        console.error(`[static] missing ${fileName}`, err);
        res.status(404).send('Not found');
      }
    });
  };
}
app.get('/payment-success.html', sendFrontendHtml('payment-success.html'));
app.get('/payment-cancel.html', sendFrontendHtml('payment-cancel.html'));
/** PayFast dashboard sometimes omits `.html` — accept both. */
app.get('/payment-success', (_req, res) => res.redirect(302, '/payment-success.html'));
app.get('/payment-cancel', (_req, res) => res.redirect(302, '/payment-cancel.html'));

app.use(
  express.static(FRONTEND_DIR, {
    extensions: ['html'],
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  })
);

app.listen(PORT, () => {
  const base = getBaseUrl();
  const sandbox = process.env.PAYFAST_SANDBOX !== 'false';
  console.log(`CultivatedText server listening on http://localhost:${PORT}`);
  console.log(`Frontend: ${FRONTEND_DIR}`);
  console.log(`BASE_URL (PayFast return/cancel/notify): ${base}`);
  console.log(`PayFast mode: ${sandbox ? 'SANDBOX' : 'LIVE'} → ${payfastProcessUrl()}`);
  console.log(`  return: ${base}/payment-success.html`);
  console.log(`  cancel: ${base}/payment-cancel.html`);
  console.log(`  notify: ${base}/api/payfast/itn`);
});

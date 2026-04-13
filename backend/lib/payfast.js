/**
 * PayFast signature + ITN helpers (MD5, PHP-compatible encoding).
 * Docs: https://developers.payfast.co.za/docs#step_4_confirming_itn
 */

const crypto = require('crypto');

/** PayFast uses PHP-style urlencode: spaces as + */
function pfEncode(value) {
  return encodeURIComponent(String(value).trim()).replace(/%20/g, '+');
}

/**
 * PHP !empty() for PayFast form fields (excludes '', '0', 0, false, null).
 */
function phpNotEmpty(val) {
  if (val === null || val === undefined) return false;
  if (val === false) return false;
  if (val === '') return false;
  if (val === '0') return false;
  if (val === 0) return false;
  return true;
}

/**
 * Payment form POST to /eng/process — must match PayFast PHP SDK Auth::generateSignature
 * (field order from the data object, NOT alphabetical). See Payfast/payfast-php-sdk lib/Auth.php
 */
function generatePaymentFormSignature(data, passphrase) {
  const PAYFAST_FIELDS = new Set([
    'merchant_id',
    'merchant_key',
    'return_url',
    'cancel_url',
    'notify_url',
    'notify_method',
    'name_first',
    'name_last',
    'email_address',
    'cell_number',
    'm_payment_id',
    'amount',
    'item_name',
    'item_description',
    'custom_int1',
    'custom_int2',
    'custom_int3',
    'custom_int4',
    'custom_int5',
    'custom_str1',
    'custom_str2',
    'custom_str3',
    'custom_str4',
    'custom_str5',
    'email_confirmation',
    'confirmation_address',
    'currency',
    'payment_method',
    'subscription_type',
    'passphrase',
    'billing_date',
    'recurring_amount',
    'frequency',
    'cycles',
    'subscription_notify_email',
    'subscription_notify_webhook',
    'subscription_notify_buyer',
  ]);

  const filtered = { ...data };
  delete filtered.signature;

  const sortAttributes = {};
  for (const key of Object.keys(filtered)) {
    if (PAYFAST_FIELDS.has(key)) {
      sortAttributes[key] = filtered[key];
    }
  }

  if (passphrase && String(passphrase).trim() !== '') {
    sortAttributes.passphrase = pfEncode(String(passphrase).trim());
  }

  let pfOutput = '';
  for (const [attribute, value] of Object.entries(sortAttributes)) {
    if (!phpNotEmpty(value)) continue;
    const val = pfEncode(String(value).trim());
    pfOutput += `${attribute}=${val}&`;
  }

  const getString = pfOutput.length ? pfOutput.slice(0, -1) : '';
  return crypto.createHash('md5').update(getString).digest('hex');
}

/**
 * ITN / API-style signature: alphabetical keys (legacy helper; ITN uses generateItnSignatureMd5).
 */
function generateSignature(data, passphrase) {
  const filtered = { ...data };
  delete filtered.signature;

  const keys = Object.keys(filtered)
    .filter((k) => filtered[k] !== '' && filtered[k] !== null && filtered[k] !== undefined)
    .sort();

  let str = keys.map((k) => `${k}=${pfEncode(filtered[k])}`).join('&');
  if (passphrase && String(passphrase).trim() !== '') {
    str += `&passphrase=${pfEncode(passphrase)}`;
  }
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * ITN MD5 — matches PayFast PHP Notification::pfValidSignature + dataToString (order = raw POST until `signature`).
 */
function generateItnSignatureMd5(rawBody, passphrase) {
  const params = new URLSearchParams(typeof rawBody === 'string' ? rawBody : '');
  const parts = [];
  for (const [key, value] of params) {
    if (key === 'signature') break;
    parts.push(`${key}=${pfEncode(value)}`);
  }
  let temp = parts.join('&');
  if (passphrase && String(passphrase).trim() !== '') {
    temp += `&passphrase=${pfEncode(String(passphrase).trim())}`;
  }
  return crypto.createHash('md5').update(temp).digest('hex');
}

/**
 * Validate ITN signature from PayFast (lowercase hex). Requires raw x-www-form-urlencoded body.
 */
function validateItnSignature(received, passphrase, rawBody) {
  const sig = received.signature;
  if (!sig || typeof sig !== 'string') return false;
  if (!rawBody || typeof rawBody !== 'string') return false;
  const expected = generateItnSignatureMd5(rawBody, passphrase);
  return expected.toLowerCase() === String(sig).toLowerCase();
}

/**
 * Known PayFast ITN source IPs (production). Sandbox may differ — use env override / skip in dev.
 * Source: PayFast integration documentation (verify periodically).
 */
const DEFAULT_PAYFAST_ITN_IPS = [
  '197.97.145.144',
  '197.97.145.145',
  '197.97.145.146',
  '197.97.145.147',
  '197.97.145.148',
];

/**
 * @param {string} remoteAddress - req.ip or socket
 * @param {string} [allowedFromEnv] - comma-separated IPs from PAYFAST_ALLOWED_ITN_IPS
 * @param {boolean} [skip] - SKIP_PAYFAST_IP_CHECK=true for local tunnel testing
 */
function isAllowedPayFastIp(remoteAddress, allowedFromEnv, skip) {
  if (skip === true || skip === 'true') return true;
  const ip = String(remoteAddress || '').replace(/^::ffff:/, '');
  const list = (allowedFromEnv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allow = list.length ? list : DEFAULT_PAYFAST_ITN_IPS;
  return allow.includes(ip);
}

/**
 * Server-side confirmation: POST same payload back to PayFast validate URL.
 * @param {string} rawBody - original x-www-form-urlencoded body from ITN
 * @param {string} validateUrl
 */
async function confirmItnWithPayFast(rawBody, validateUrl) {
  const res = await fetch(validateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: rawBody,
  });
  const text = (await res.text()).trim();
  return text === 'VALID';
}

module.exports = {
  generateSignature,
  generatePaymentFormSignature,
  generateItnSignatureMd5,
  validateItnSignature,
  isAllowedPayFastIp,
  confirmItnWithPayFast,
  pfEncode,
  DEFAULT_PAYFAST_ITN_IPS,
};

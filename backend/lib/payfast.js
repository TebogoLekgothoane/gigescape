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
 * Build the string PayFast signs, then MD5 it.
 * Excludes empty values and the `signature` key. Appends passphrase at the end.
 *
 * @param {Record<string, string>} data
 * @param {string} passphrase
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
 * Validate ITN signature from PayFast (lowercase hex).
 */
function validateItnSignature(received, passphrase) {
  const sig = received.signature;
  if (!sig || typeof sig !== 'string') return false;
  const expected = generateSignature(received, passphrase);
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
  validateItnSignature,
  isAllowedPayFastIp,
  confirmItnWithPayFast,
  pfEncode,
  DEFAULT_PAYFAST_ITN_IPS,
};

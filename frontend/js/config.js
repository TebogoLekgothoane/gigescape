/**
 * API base URL for fetch() calls (Express on Railway, etc.).
 * Local: empty string = same origin.
 * Vercel: set RAILWAY_API_URL to your Railway HTTPS origin (no path, no trailing slash).
 */
(function () {
  if (typeof window === 'undefined') return;
  if (window.__API_BASE__ !== undefined && window.__API_BASE__ !== null) return;

  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    window.__API_BASE__ = '';
    return;
  }

  var RAILWAY_API_URL = 'REPLACE_WITH_RAILWAY_API_URL';
  if (RAILWAY_API_URL.indexOf('REPLACE_WITH_') === 0) {
    console.warn(
      '[CultivatedText] Set RAILWAY_API_URL in frontend/js/config.js to your API URL (see README).'
    );
    window.__API_BASE__ = '';
    return;
  }

  window.__API_BASE__ = RAILWAY_API_URL.replace(/\/$/, '');
})();

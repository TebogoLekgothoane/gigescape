/**
 * Analytics placeholder — replace track() with GA4, Plausible, or your provider.
 * No PII is sent from here by default.
 */
(function () {
  window.CultivatedTextAnalytics = {
    /**
     * @param {string} name
     * @param {Record<string, string>} [params]
     */
    track(name, params) {
      if (typeof window !== 'undefined' && window.__DEBUG_ANALYTICS__) {
        console.debug('[Analytics placeholder]', name, params || {});
      }
    },
  };

  window.CultivatedTextAnalytics.track('page_view', {
    path: window.location.pathname,
  });
})();

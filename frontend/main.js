/* =============================================
   CultivatedText — UI: nav, lead API, FAQ, scroll
   ============================================= */

const qs = (s, ctx = document) => ctx.querySelector(s);
const qsa = (s, ctx = document) => [...ctx.querySelectorAll(s)];

/** Same-origin API when served via Express; override for split dev servers if needed */
function getApiBase() {
  if (typeof window.__API_BASE__ === 'string' && window.__API_BASE__) {
    return window.__API_BASE__.replace(/\/$/, '');
  }
  return '';
}

// ── Sticky nav ─────────────────────────────────
const nav = qs('#mainNav');
if (nav) {
  window.addEventListener(
    'scroll',
    () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    },
    { passive: true }
  );
}

// ── Mobile menu ────────────────────────────────
const hamburger = qs('#hamburger');
const navLinks = qs('#navLinks');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  qsa('a', navLinks).forEach((a) => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

// ── Lead form → POST /api/lead ─────────────────
const leadForm = qs('#leadForm');
if (leadForm) {
  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = qs('#name');
    const email = qs('#email');
    const status = leadForm.querySelector('input[name="status"]:checked');
    const nameErr = qs('#nameError');
    const emailErr = qs('#emailError');
    const statusErr = qs('#statusError');
    const globalErr = qs('#formGlobalError');
    const submitBtn = qs('#leadSubmitBtn');

    [nameErr, emailErr, statusErr].forEach((el) => {
      if (el) el.textContent = '';
    });
    if (globalErr) {
      globalErr.textContent = '';
      globalErr.classList.remove('is-visible');
    }
    [name, email].forEach((el) => el && el.classList.remove('error'));

    let valid = true;
    if (!name.value.trim() || name.value.trim().length < 2) {
      nameErr.textContent = 'Please enter your full name.';
      name.classList.add('error');
      valid = false;
    }
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.value.trim() || !emailRx.test(email.value.trim())) {
      emailErr.textContent = 'Please enter a valid email address.';
      email.classList.add('error');
      valid = false;
    }
    if (!status) {
      statusErr.textContent = 'Please select your current status.';
      valid = false;
    }
    if (!valid) return;

    const payload = {
      name: name.value.trim(),
      email: email.value.trim(),
      status: status.value,
    };

    submitBtn.classList.add('is-loading');
    submitBtn.setAttribute('aria-busy', 'true');

    try {
      const res = await fetch(`${getApiBase()}/api/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        if (window.CultivatedTextAnalytics) {
          window.CultivatedTextAnalytics.track('lead_submit', { path: '/lead' });
        }
        window.location.href = 'thankyou.html';
        return;
      }

      if (res.status === 409 && data.code === 'DUPLICATE_EMAIL') {
        if (globalErr) {
          globalErr.textContent =
            data.message || 'This email is already registered.';
          globalErr.classList.add('is-visible');
        }
        return;
      }

      if (res.status === 400 && data.errors && Array.isArray(data.errors)) {
        const first = data.errors[0];
        const msg = first && first.msg ? first.msg : data.message || 'Please check your details.';
        if (globalErr) {
          globalErr.textContent = msg;
          globalErr.classList.add('is-visible');
        }
        return;
      }

      if (res.status === 429) {
        if (globalErr) {
          globalErr.textContent =
            data.message || 'Too many attempts. Please wait a few minutes and try again.';
          globalErr.classList.add('is-visible');
        }
        return;
      }

      if (globalErr) {
        globalErr.textContent =
          data.message || 'Something went wrong. Please try again in a moment.';
        globalErr.classList.add('is-visible');
      }
    } catch {
      if (globalErr) {
        globalErr.textContent =
          'Could not reach the server. Check your connection and that the app is running (see README).';
        globalErr.classList.add('is-visible');
      }
    } finally {
      submitBtn.classList.remove('is-loading');
      submitBtn.setAttribute('aria-busy', 'false');
    }
  });
}

// ── FAQ ────────────────────────────────────────
qsa('.faq-q').forEach((btn) => {
  btn.addEventListener('click', () => {
    const answer = btn.nextElementSibling;
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    qsa('.faq-q').forEach((b) => {
      b.setAttribute('aria-expanded', 'false');
      b.nextElementSibling.classList.remove('open');
    });
    if (!expanded) {
      btn.setAttribute('aria-expanded', 'true');
      answer.classList.add('open');
    }
  });
});

// ── Scroll reveal ──────────────────────────────
const revealEls = qsa('.benefit-card, .offer-item, .testimonial-card, .ty-step, .inside-list li');
if ('IntersectionObserver' in window && revealEls.length) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = revealEls.indexOf(entry.target);
          entry.target.style.animationDelay = `${(idx % 3) * 0.1}s`;
          entry.target.classList.add('animate-up');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => {
    el.style.opacity = '0';
    io.observe(el);
  });
}

// ── Sales: PayFast checkout (server-signed POST) ─
const payNowBtn = qs('#payNowBtn');
const payfastEmail = qs('#payfastEmail');
const payfastFirst = qs('#payfastFirstName');
const payfastLast = qs('#payfastLastName');
const payfastErr = qs('#payfastFormError');

async function submitPayFastCheckout() {
  if (!payNowBtn || !payfastEmail) return;
  const email = payfastEmail.value.trim();
  const nameFirst = payfastFirst ? payfastFirst.value.trim() : '';
  const nameLast = payfastLast ? payfastLast.value.trim() : '';

  if (payfastErr) {
    payfastErr.textContent = '';
    payfastErr.classList.remove('is-visible');
  }

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRx.test(email)) {
    if (payfastErr) {
      payfastErr.textContent = 'Please enter a valid email address for your receipt.';
      payfastErr.classList.add('is-visible');
    }
    payfastEmail.classList.add('error');
    return;
  }
  payfastEmail.classList.remove('error');

  payNowBtn.classList.add('is-loading');
  payNowBtn.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch(`${getApiBase()}/api/payfast/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name_first: nameFirst || undefined,
        name_last: nameLast || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.action || !data.fields) {
      const msg =
        data.message ||
        (res.status === 503
          ? 'Payment is not configured on the server. See README.'
          : 'Could not start checkout. Please try again.');
      if (payfastErr) {
        payfastErr.textContent = msg;
        payfastErr.classList.add('is-visible');
      }
      return;
    }

    if (window.CultivatedTextAnalytics) {
      window.CultivatedTextAnalytics.track('payfast_checkout_start', { path: '/sales' });
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = data.action;
    form.setAttribute('accept-charset', 'utf-8');
    Object.entries(data.fields).forEach(([k, v]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = k;
      input.value = String(v);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  } catch {
    if (payfastErr) {
      payfastErr.textContent = 'Network error. Check your connection and try again.';
      payfastErr.classList.add('is-visible');
    }
  } finally {
    payNowBtn.classList.remove('is-loading');
    payNowBtn.setAttribute('aria-busy', 'false');
  }
}

if (payNowBtn) {
  payNowBtn.addEventListener('click', () => {
    submitPayFastCheckout();
  });
}

// ── In-page anchors ────────────────────────────
qsa('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

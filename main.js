/* =============================================
   CULTIVATEDTEXT — MAIN JAVASCRIPT
   Form validation · Nav · FAQ · Scroll effects
   ============================================= */

// ── Utility ──────────────────────────────────
const qs  = (s, ctx = document) => ctx.querySelector(s);
const qsa = (s, ctx = document) => [...ctx.querySelectorAll(s)];

// ── Sticky nav shadow on scroll ──────────────
const nav = qs('#mainNav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// ── Mobile hamburger ─────────────────────────
const hamburger = qs('#hamburger');
const navLinks  = qs('#navLinks');
if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', navLinks.classList.contains('open'));
  });
  // Close on link click
  qsa('a', navLinks).forEach(a => {
    a.addEventListener('click', () => navLinks.classList.remove('open'));
  });
}

// ── LEAD FORM VALIDATION & SUBMIT ─────────────
const leadForm = qs('#leadForm');
if (leadForm) {
  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let valid = true;

    const name   = qs('#name');
    const email  = qs('#email');
    const status = leadForm.querySelector('input[name="status"]:checked');

    const nameErr   = qs('#nameError');
    const emailErr  = qs('#emailError');
    const statusErr = qs('#statusError');

    // Reset errors
    [nameErr, emailErr, statusErr].forEach(el => el.textContent = '');
    [name, email].forEach(el => el.classList.remove('error'));

    // Validate name
    if (!name.value.trim() || name.value.trim().length < 2) {
      nameErr.textContent = 'Please enter your full name.';
      name.classList.add('error');
      valid = false;
    }

    // Validate email
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.value.trim() || !emailRx.test(email.value.trim())) {
      emailErr.textContent = 'Please enter a valid email address.';
      email.classList.add('error');
      valid = false;
    }

    // Validate status
    if (!status) {
      statusErr.textContent = 'Please select your current status.';
      valid = false;
    }

    if (!valid) return;

    // Save to localStorage (simulate backend)
    const lead = {
      name:      name.value.trim(),
      email:     email.value.trim(),
      status:    status.value,
      timestamp: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(localStorage.getItem('cultivatedtext_leads') || '[]');
      existing.push(lead);
      localStorage.setItem('cultivatedtext_leads', JSON.stringify(existing));
    } catch (_) {}

    // Show loading state
    const btn = leadForm.querySelector('button[type="submit"]');
    btn.textContent = 'Sending…';
    btn.disabled = true;

    // Simulate sending delay → redirect
    setTimeout(() => {
      window.location.href = 'thankyou.html';
    }, 700);
  });
}

// ── FAQ ACCORDION ─────────────────────────────
qsa('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const answer   = btn.nextElementSibling;
    const expanded = btn.getAttribute('aria-expanded') === 'true';

    // Close all others
    qsa('.faq-q').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
      b.nextElementSibling.classList.remove('open');
    });

    // Toggle current
    if (!expanded) {
      btn.setAttribute('aria-expanded', 'true');
      answer.classList.add('open');
    }
  });
});

// ── SCROLL REVEAL (Intersection Observer) ─────
const revealEls = qsa('.benefit-card, .offer-item, .testimonial-card, .ty-step, .inside-list li');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger each card
        const idx = revealEls.indexOf(entry.target);
        entry.target.style.animationDelay = `${(idx % 3) * 0.1}s`;
        entry.target.classList.add('animate-up');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealEls.forEach(el => {
    el.style.opacity = '0';
    io.observe(el);
  });
}

// ── Smooth scroll for anchor links ───────────
qsa('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id  = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
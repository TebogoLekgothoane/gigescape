# CultivatedText — marketing site & lead funnel

This repository contains the **CultivatedText** web application: lead capture, thank-you step, sales checkout via **PayFast**, and server-side **ITN** (Instant Transaction Notification) handling. **CultivatedText** is the product and brand; this document is for anyone deploying, maintaining, or extending the site on behalf of the business.

## What this project does

| Page | Purpose |
|------|---------|
| **Landing** (`/`) | Free prompt-pack offer; captures **name**, **email**, and **status** |
| **Thank you** (`/thankyou.html`) | Confirms signup; CTA to the sales page |
| **Sales** (`/sales.html`) | Offer (**R1,000**), **Pay R1000 Now** → signed POST to PayFast |
| **Payment success** (`/payment-success.html`) | Return URL after PayFast approves payment |
| **Payment cancel** (`/payment-cancel.html`) | Cancel URL if the buyer abandons checkout |

**APIs:** `POST /api/lead` (leads), `POST /api/payfast/init` (signed checkout fields), `POST /api/payfast/itn` (PayFast webhook — **not** called from the browser).

**User journey:** Landing → lead form → thank you → sales → PayFast → success or cancel page. **Paid** status is set when PayFast sends a valid **COMPLETE** ITN to `/api/payfast/itn`.

## Repository layout

```
├── README.md
├── frontend/
│   ├── index.html
│   ├── thankyou.html
│   ├── sales.html              ← checkout UI + “Pay R1000 Now”
│   ├── payment-success.html    ← return_url
│   ├── payment-cancel.html     ← cancel_url
│   ├── styles.css
│   ├── main.js
│   └── js/analytics.js
├── vercel.json                 ← outputDirectory: frontend (Vercel static root)
├── package.json                ← minimal scripts for Vercel build step
└── backend/
    ├── package.json
    ├── server.js               ← Express + APIs + static files
    ├── lib/
    │   └── payfast.js          ← MD5 signature + ITN helpers
    ├── .env.example
    ├── .gitignore
    └── data/
        └── leads.json          ← leads + payment flags
```

## Deploying on Vercel

**Why you saw `404 NOT_FOUND`:** Vercel deployed the **repo root**, which has no `index.html` at `/` — only under **`frontend/`**.

**Fix (in this repo):** **`vercel.json`** sets **`outputDirectory`** to **`frontend`**, so the built site root is your HTML/CSS/JS (Vercel’s default **`public`** folder is not used). Redeploy after pulling this change (`vercel --prod` or push to GitHub if the project is linked).

**APIs on Vercel:** A plain **static** deployment does **not** run the **Express** server. Paths like **`/api/lead`** and **`/api/payfast/*`** will **not** work on Vercel until you either:

1. **Host the backend elsewhere** (e.g. **Railway**, **Render**, **Fly.io**) and point the browser at that API:
   - Set **`window.__API_BASE__`** to your API origin (e.g. `https://your-api.railway.app`) **before** `main.js` loads on each HTML page, **or**
   - Add a **Vercel rewrite** (in the dashboard) from `/api/:path*` → your backend’s `/api/:path*`, and keep **`CORS_ORIGIN`** on the backend including `https://gigesacpe.vercel.app` (your real Vercel URL).
2. **Or** run **only** the full Node app on a VPS/Railway (Express serves **`frontend/`** + API in one process) and skip Vercel for production.

**PayFast `BASE_URL`:** Must be your **public** site URL (e.g. `https://gigesacpe.vercel.app`) so return/cancel/notify URLs are correct.

## Lead record (JSON)

Each lead may include:

| Field | Meaning |
|--------|---------|
| `name`, `email`, `status`, `createdAt` | From the lead form |
| `paid` | `true` after a verified PayFast ITN |
| `paymentId` | PayFast payment reference (`pf_payment_id` when present) |
| `paymentAmount` | Gross amount from ITN (must match configured amount) |
| `paidAt` | ISO timestamp when marked paid |

## Requirements

- **Node.js 18+** — [https://nodejs.org/](https://nodejs.org/) (global `fetch` is used for PayFast server validation).

## Local setup

1. **Install dependencies**

   ```bash
   cd backend
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env
   ```

   Fill in at least:

   - **`BASE_URL`** — e.g. `http://localhost:3000` (no trailing slash). Used to build PayFast **return**, **cancel**, and **notify** URLs.
   - **`MERCHANT_ID`**, **`MERCHANT_KEY`**, **`PASSPHRASE`** — from the PayFast dashboard (**sandbox** first).
   - **`PAYFAST_SANDBOX=true`** until you go live.
   - **`CORS_ORIGIN`** — e.g. `http://localhost:3000` when using this server for both HTML and API.

3. **Run**

   ```bash
   npm start
   ```

4. **Open**

   - **http://localhost:3000/** — landing  
   - **http://localhost:3000/sales.html** — PayFast checkout  

Do not open HTML via `file://`; the APIs expect the same origin (or CORS-approved origins).

### Watch mode

```bash
cd backend
npm run dev
```

---

## PayFast — step-by-step (CultivatedText)

### 1) Create / log into PayFast

Sign up at [PayFast](https://www.payfast.co.za/), open **Integration → Merchant credentials**, and copy **Merchant ID**, **Merchant Key**, and set a **Passphrase** under security settings.

### 2) Sandbox first

Use **sandbox** credentials in `.env` with **`PAYFAST_SANDBOX=true`**.  
Process URL: `https://sandbox.payfast.co.za/eng/process`  
Validate URL (server-side): `https://sandbox.payfast.co.za/eng/query/validate`

### 3) URLs in the PayFast dashboard

Set these to match **`BASE_URL`** in `.env` (production must be **HTTPS**):

| Setting | Example |
|---------|---------|
| **Return URL** | `https://yourdomain.com/payment-success.html` |
| **Cancel URL** | `https://yourdomain.com/payment-cancel.html` |
| **Notify URL (ITN)** | `https://yourdomain.com/api/payfast/itn` |

The app also sends these URLs on each transaction from **`POST /api/payfast/init`**; keep dashboard values aligned.

**404 after returning from PayFast:** `BASE_URL` and **`PORT`** must match what you use in the browser (e.g. `BASE_URL=http://localhost:3001` if the app runs on port **3001**). Set **`CORS_ORIGIN`** to the same origin. After changing `.env`, restart the server. On startup, the console prints the exact **return / cancel / notify** URLs in use — copy those into the PayFast dashboard if unsure.

### 4) How checkout works (no passphrase in the browser)

1. Buyer enters **email** (and optional names) on **`sales.html`** and clicks **Pay R1000 Now**.  
2. Browser calls **`POST /api/payfast/init`** with JSON `{ email, name_first?, name_last? }`.  
3. Server builds PayFast fields (**amount** `1000.00`, **item_name** “AI Resume Quick-Win Kit”, URLs above), computes the **MD5 signature** with **`PASSPHRASE`**, returns JSON `{ action, fields }`.  
4. Browser builds a **hidden `<form method="POST">`** and submits to PayFast (sandbox or live **process** URL).  
5. Buyer pays on PayFast.  
6. PayFast **redirects** the buyer to **return** or **cancel** pages.  
7. PayFast **POSTs ITN** to **`/api/payfast/itn`**. The server verifies **signature**, **merchant_id**, **amount_gross**, **payment_status = COMPLETE**, **source IP** (configurable), then **re-posts the raw body** to PayFast **`/eng/query/validate`**. If the response is **`VALID`**, the matching lead (by **email**) is updated: **`paid: true`**, **`paymentId`**, **`paymentAmount`**, **`paidAt`**.

### 5) Where credentials live

| Variable | Role |
|----------|------|
| `MERCHANT_ID` | PayFast merchant ID |
| `MERCHANT_KEY` | PayFast merchant key (used in signed form; still server-side only) |
| `PASSPHRASE` | Signature secret — **never** expose to the frontend |
| `BASE_URL` | Builds return / cancel / notify URLs |

### 6) Testing ITN on localhost

PayFast cannot reach `http://localhost`. Use a tunnel (e.g. ngrok), set **`BASE_URL`** to the public `https` URL, and configure that **Notify URL** in PayFast. For IP checks while debugging, you can set **`SKIP_PAYFAST_IP_CHECK=true`** — **disable this in production**.

### 7) Go live

1. Switch to **live** credentials in PayFast.  
2. Set **`PAYFAST_SANDBOX=false`** in `.env`.  
3. Set **`BASE_URL`** to the real **`https://`** domain.  
4. Re-test return, cancel, and ITN end-to-end.

---

## HTTP API (reference)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/lead` | JSON `{ name, email, status }` — create lead |
| `POST` | `/api/payfast/init` | JSON `{ email, name_first?, name_last? }` — return signed PayFast fields |
| `POST` | `/api/payfast/itn` | PayFast **only** — `application/x-www-form-urlencoded` ITN body |
| `GET` | `/api/health` | Health check |

---

## Security notes

- **Passphrase** and merchant secrets stay in **`.env`**.
- ITNs are checked: **signature**, **merchant_id**, **amount**, **COMPLETE**, **PayFast IP allowlist** (or skip flag for dev), **server validate** call.
- Rate limits apply to **`/api/lead`** and **`/api/payfast/init`** (not to PayFast ITN).

## Data & backups

Leads and payment flags live in **`backend/data/leads.json`**. Back this file up or move to a database for production.

## Brand & support (CultivatedText)

- **Brand:** CultivatedText  
- **Sales WhatsApp:** as on the sales page (**0703478219**)

---

*Documentation for the CultivatedText web property. For content or pricing changes, coordinate with CultivatedText stakeholders before publishing.*

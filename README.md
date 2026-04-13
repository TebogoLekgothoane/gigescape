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
│   └── js/
│       ├── config.js           ← Railway API URL for production (Vercel)
│       └── analytics.js
├── vercel.json                 ← outputDirectory: frontend (Vercel static root)
├── package.json                ← minimal scripts for Vercel build step
└── backend/
    ├── Procfile                ← Railway / process hosts
    ├── railway.toml
    ├── package.json
    ├── server.js               ← Express + APIs + static files
    ├── lib/
    │   └── payfast.js          ← MD5 signature + ITN helpers
    ├── .env.example
    ├── .gitignore
    └── data/
        └── leads.json          ← leads + payment flags
```

## Production: Vercel (site) + Railway (API + PayFast)

**Architecture**

| Piece | Host | Role |
|--------|------|------|
| **Pages** | **Vercel** (`gigesacpe.vercel.app`) | Static HTML/CSS/JS only. |
| **API** | **Railway** (your `*.up.railway.app` URL) | Express: `/api/lead`, `/api/payfast/init`, `/api/payfast/itn`. |

**Vercel:** **`vercel.json`** uses **`outputDirectory": "frontend"`** so `/` serves `index.html`. Redeploy with `vercel --prod` or git push.

### 1) Deploy the API on Railway

1. Create a project on [Railway](https://railway.app/) → **Deploy from GitHub** (this repo).
2. Set **Root Directory** to **`backend`** (or deploy only the `backend` folder).
3. **Variables** (example):

   | Variable | Example |
   |----------|---------|
   | `FRONTEND_URL` | `https://gigesacpe.vercel.app` |
   | `API_PUBLIC_URL` | `https://YOUR-SERVICE.up.railway.app` (Railway shows this after deploy) |
   | `CORS_ORIGIN` | `https://gigesacpe.vercel.app` |
   | `TRUST_PROXY` | `1` |
   | `MERCHANT_ID`, `MERCHANT_KEY`, `PASSPHRASE` | From PayFast |
   | `PAYFAST_SANDBOX` | `true` until go-live |

   **`API_PUBLIC_URL`** must match the **public HTTPS URL** Railway assigns (same value you put in **`frontend/js/config.js`**).

4. **Generate domain** in Railway so the API has a stable `https://…` URL.
5. **Health check:** open `https://YOUR-SERVICE.up.railway.app/api/health` — should return JSON `{"ok":true,…}`.

**Data:** `backend/data/leads.json` lives on Railway’s filesystem. For durability across restarts, add a **volume** mounted at `backend/data` or move to a database later.

### 2) Point the Vercel site at the API

1. Open **`frontend/js/config.js`**.
2. Replace **`REPLACE_WITH_RAILWAY_API_URL`** with your Railway API origin only, e.g. `https://your-service.up.railway.app` (no trailing slash, no `/api` path).
3. Commit, push, and let Vercel redeploy (or `vercel --prod`).

The browser will call **`https://…railway.app/api/lead`** etc. **`CORS_ORIGIN`** on Railway must include **`https://gigesacpe.vercel.app`**.

### 3) PayFast URLs (split hosts)

After Railway + Vercel envs are set, the server logs (on Railway) show:

- **Return / cancel** → **`FRONTEND_URL`** (Vercel).
- **Notify (ITN)** → **`API_PUBLIC_URL`** (Railway).

Put the **notify** URL in the PayFast dashboard:  
`https://YOUR-SERVICE.up.railway.app/api/payfast/itn`

Use **live** credentials and **`PAYFAST_SANDBOX=false`** only when going live.

### 4) Local development (unchanged)

Run **`npm start`** in **`backend`** and open **`http://localhost:PORT`**. Leave **`FRONTEND_URL`** / **`API_PUBLIC_URL`** empty so **`BASE_URL`** is used for everything; keep **`frontend/js/config.js`** placeholder or use localhost (empty API base).

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

   - **`BASE_URL`** — e.g. `http://localhost:3000` (no trailing slash). Used when **`FRONTEND_URL`** / **`API_PUBLIC_URL`** are not set (typical local dev).
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

The server builds URLs from **`.env`** (production must use **HTTPS**):

| Setting | Built from | Example (split: Vercel + Railway) |
|---------|------------|-----------------------------------|
| **Return URL** | **`FRONTEND_URL`** (fallback: `BASE_URL`) | `https://gigesacpe.vercel.app/payment-success.html` |
| **Cancel URL** | **`FRONTEND_URL`** | `https://gigesacpe.vercel.app/payment-cancel.html` |
| **Notify URL (ITN)** | **`API_PUBLIC_URL`** (fallback: `BASE_URL`) | `https://your-api.up.railway.app/api/payfast/itn` |

**Single-server local dev:** only **`BASE_URL`** is needed; return, cancel, and notify all use that host.

The app sends these on each **`POST /api/payfast/init`**; align the PayFast dashboard with the same hosts. On startup, the API logs **return / cancel / notify** — copy from Railway logs if unsure.

**404 after PayFast return:** **`FRONTEND_URL`** must be your **Vercel** site (no trailing slash). **`PORT`** only affects local **`BASE_URL`**.

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
| `BASE_URL` | Fallback when `FRONTEND_URL` / `API_PUBLIC_URL` unset (local dev) |
| `FRONTEND_URL` | PayFast **return** and **cancel** (usually **Vercel**) |
| `API_PUBLIC_URL` | PayFast **notify (ITN)** — must be this API’s public URL (usually **Railway**) |

### 6) Testing ITN on localhost

PayFast cannot reach `http://localhost`. Use a tunnel (e.g. ngrok), set **`BASE_URL`** to the public `https` URL, and configure that **Notify URL** in PayFast. For IP checks while debugging, you can set **`SKIP_PAYFAST_IP_CHECK=true`** — **disable this in production**.

### 7) Go live

1. Switch to **live** credentials in PayFast.  
2. Set **`PAYFAST_SANDBOX=false`** in the API **`.env`** (Railway variables).  
3. Set **`FRONTEND_URL`** = `https://gigesacpe.vercel.app` (or your custom domain) and **`API_PUBLIC_URL`** = your Railway **`https://`** API URL.  
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

# AYDT Registration Portal

A full-stack registration and administration platform for the Academy of Youth Dance & Theatre (AYDT). It provides a public-facing portal where families can browse classes and register dancers, and a private admin portal where staff manage semesters, families, payments, and communications.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Getting Started](#getting-started)
3. [Environment Variables](#environment-variables)
4. [Project Structure](#project-structure)
5. [Key Features](#key-features)
6. [Available Scripts](#available-scripts)
7. [Tech Stack](#tech-stack)

---

## Project Overview

AYDT runs seasonal semesters of dance classes. This platform handles the full lifecycle:

- **Admins** create a semester, configure sessions and session groups, set pricing/payment plans, build a custom registration form, and publish it
- **Families** browse available sessions, add classes to a cart, fill out the registration form, and pay
- **The system** manages waitlists (with invite tokens and expiry), broadcast emails (scheduled or immediate), payment processing via Elavon, and SMS notifications via Twilio

There are two distinct areas of the app:

| Area | URL prefix | Who uses it |
|---|---|---|
| Public registration portal | `/` (root, `/semester`, `/cart`, `/register`) | Families / parents |
| Admin portal | `/admin` | AYDT staff |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (for the database and auth)
- A Resend account (for transactional email)
- An Elavon EPG account (for payment processing)
- A Twilio account (for SMS, optional in dev)
- An Upstash Redis database (for rate limiting)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in environment variables
cp .env.local.example .env.local
# Edit .env.local — see Environment Variables section below

# 3. Verify all required env vars are set
npm run check-env

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public portal.
Open [http://localhost:3000/admin](http://localhost:3000/admin) for the admin portal (requires authenticated admin user).

---

## Environment Variables

Create a `.env.local` file in the project root with the following variables:

```bash
# App
NODE_ENV=development
NEXT_PUBLIC_BASE_URL=http://localhost:3000
SITE_URL=https://your-ngrok-or-production-url.com   # Used in waitlist acceptance links

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key     # Server-side only

# Resend (email delivery)
RESEND_API_KEY=re_your_key
RESEND_FROM_EMAIL=hello@yourdomain.com
ADMIN_NOTIFICATION_EMAIL=admin@yourdomain.com

# Elavon EPG (payments)
EPG_SECRET_KEY=sk_your_key
EPG_PUBLIC_KEY=pk_your_key
EPG_MERCHANT_ALIAS=your_alias
EPG_BASE_URL=https://uat.api.converge.eu.elavonaws.com   # sandbox
# EPG_BASE_URL=https://api.eu.convergepay.com             # production

# EPG webhook auth (you set these; Elavon sends them with each webhook)
EPG_WEBHOOK_USERNAME=your_username
EPG_WEBHOOK_PASSWORD=your_password

# Twilio (SMS)
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
TWILIO_VERIFY_SERVICE_SID=your_verify_sid
TWILIO_WEBHOOK_AUTH_TOKEN=your_webhook_token
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# Google Tag Manager (analytics, optional)
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX   # Leave blank to disable
```

> **Note:** Never commit `.env.local` to version control. It contains secrets.

---

## Project Structure

```
aydt-registration-admin-portal/
├── app/
│   ├── (user-facing)/              # Public registration portal (route group)
│   │   ├── cart/                   # Cart view and checkout entry
│   │   ├── profile/                # Family profile, dancer management
│   │   ├── register/               # Multi-step registration wizard
│   │   ├── semester/[id]/          # Semester landing + session browser
│   │   └── waitlist/accept/        # Waitlist token acceptance page
│   │
│   ├── admin/                      # Admin portal
│   │   ├── _components/            # Shared admin layout (TopBar, NotificationBell, right panels)
│   │   ├── semesters/              # Semester CRUD + 9-step editor
│   │   ├── families/               # Family records and dancer management
│   │   ├── emails/                 # Broadcast email composer and scheduler
│   │   ├── payments/               # Payment history and status
│   │   ├── sessions/               # Session table view
│   │   ├── media/                  # Media library (image upload and picker)
│   │   └── users/                  # Admin user management
│   │
│   ├── api/
│   │   ├── media/                  # Media CRUD API routes
│   │   ├── register/               # Registration batch-status polling endpoint
│   │   ├── upload-image/           # Image upload handler
│   │   └── webhooks/
│   │       ├── epg/                # Elavon payment webhook receiver
│   │       └── resend/             # Resend delivery event webhook receiver
│   │
│   ├── auth/                       # Login, password reset, and confirm flows
│   ├── components/
│   │   ├── public/                 # Shared UI for the public portal (ClassCard, FilterBar, SessionGrid)
│   │   ├── semester-flow/          # Semester editor components (TipTap, form builders, modals)
│   │   ├── email/                  # Email preview components (iPhone frame)
│   │   └── media/                  # Image picker modal
│   └── providers/                  # React context providers (Auth, Cart, Registration)
│
├── queries/                        # Supabase query functions (read-only DB calls)
│   └── admin/                      # Admin-specific queries (family detail, etc.)
│
├── lib/
│   └── schemas/                    # Zod validation schemas
│
├── types/
│   └── index.ts                    # All shared TypeScript types (single source of truth)
│
├── utils/
│   ├── supabase/                   # Supabase client factories (server, client, middleware)
│   ├── payment/
│   │   └── epg.ts                  # Elavon EPG API client
│   ├── resolveEmailVariables.ts    # Email template token replacement
│   └── prepareEmailHtml.ts         # HTML normalization for email clients
│
├── supabase/
│   ├── migrations/                 # Database schema history (source of truth for column names)
│   └── functions/                  # Supabase Edge Functions (Deno)
│       ├── process-waitlist/       # Scheduled: promote waitlist entries, send invites
│       ├── process-scheduled-emails/ # Scheduled: dispatch emails at their scheduled time
│       └── send-email-broadcast/   # Triggered: fan-out broadcast email delivery
│
├── docs/
│   └── elavon/                     # Elavon EPG API documentation (read before any payment work)
│
├── scripts/                        # Dev utilities (env checker, seed scripts)
└── tests/                          # Vitest unit tests
```

---

## Key Features

### Public Portal

- **Semester browser** — Families view currently published semesters, browse sessions by day/style/level, and see capacity/waitlist status in real time
- **Cart** — Sessions are added to a localStorage cart; cart is preserved across page navigations
- **Registration wizard** — Multi-step form (dancer info → custom form fields → payment plan selection → payment) driven by the semester's configured registration form
- **Payment** — Elavon hosted checkout for first payment; stored cards/ACH for subsequent installments
- **Waitlist** — Full session displays a "Join Waitlist" CTA; when a spot opens, the system sends an invite email with a time-limited token link

### Admin Portal

- **Semester editor** — 9-step guided editor: basic info → session groups → sessions → payment plans → discounts → registration form → confirmation email → waitlist settings → review & publish
- **Family management** — View family records, add/edit dancers, see registration history and billing
- **Broadcast emails** — Compose rich-text emails with TipTap, preview in an iPhone frame, target by semester/session/status, schedule for future delivery or send immediately
- **Media library** — Upload images for use in email templates and semester content
- **Dashboard** — Overview of active semesters, recent registrations, and payment activity

### Background Processing

- **Waitlist automation** — Supabase Edge Function runs on a schedule, checks for open spots, and sends invite emails
- **Scheduled email dispatch** — Edge Function fires scheduled emails at their configured time
- **Webhook processing** — Elavon payment webhooks finalize registrations; Resend webhooks track email delivery status

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type checking |
| `npm run check-env` | Verify all required environment variables are set |
| `npm test` | Run Vitest unit tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run db:new` | Create a new Supabase migration file |
| `npm run db:status` | List applied/pending migrations |
| `npm run db:seed` | Seed the database with development data |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + SCSS + CSS custom properties |
| Database | PostgreSQL via Supabase (with RLS) |
| Auth | Supabase Auth (Magic Links) |
| File Storage | Supabase Storage |
| Email Delivery | Resend |
| Payments | Elavon EPG (hosted checkout + stored cards/ACH) |
| SMS | Twilio |
| Rich Text Editor | TipTap (ProseMirror) |
| Rate Limiting | Upstash Redis |
| Form Validation | Zod + React Hook Form |
| Charts | Recharts |
| Drag and Drop | dnd-kit |
| Edge Functions | Deno (Supabase Functions) |
| Task Scheduling | `pg_cron` (PostgreSQL cron jobs) |
| Analytics | Google Tag Manager + GA4 |
| Unit Testing | Vitest + Testing Library |
| E2E Testing | Playwright |

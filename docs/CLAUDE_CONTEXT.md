# AYDT Registration Admin Portal — Project Context

Use this document to understand the full scope of this project when brainstorming UI layout ideas.

---

## What This Project Is

**AYDT Registration Admin Portal** is a dual-portal SaaS platform for managing dance studio operations.

- **Admin Portal** — Studio staff manage semesters, classes, sessions, email broadcasts, payments, dancers, and families
- **User Portal** — Families browse programs, add sessions to cart, register dancers, and complete payment

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 + SCSS |
| Icons | lucide-react |
| Forms | React Hook Form + Zod |
| Rich Text | TipTap (ProseMirror) |
| State | React Context + useReducer (no Redux) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (magic links) |
| Storage | Supabase Storage |
| Email | Resend API |
| SMS | Twilio |
| Rate Limiting | Upstash Redis |
| Edge Functions | Deno (Supabase Functions) |

---

## Design System

### Color Palette

**Brand** — Wine Red
- Primary base: `#8E2A23`
- Scale: `primary-50` (light rose) → `primary-900` (dark wine)

**Semantic Accents** (badge/tag colors)
- Mint (success/positive): teal bg + teal text
- Lavender (secondary): purple bg + purple text
- Sage (active): green bg + green text
- Mauve (competition track): pink bg + pink text
- Pale Rose (neutral): warm pink

**Semantic Alerts**
- Success: `#C8EEE2` bg / `#0A5A50` text
- Error: `#F4D4CE` bg / `#7A2018` text
- Warning: `#FAECD0` bg / `#7A4E08` text
- Info: `#E0DCF4` bg / `#3A3080` text

### Admin Portal Colors

| Element | Value |
|---|---|
| Sidebar background | `#160C0A` (very dark brown) |
| Sidebar border | `#221410` |
| Sidebar text | `#B8A8A4` (warm gray) |
| Sidebar active link | `#8E2A23` (wine red) |
| Page background | `#F7F5F2` (warm off-white) |
| Surface (cards) | `#FFFFFF` |
| Border | `#DDD9D2` |
| Text primary | `#201D18` |
| Text muted | `#736D65` |
| Text faint | `#9E9890` |
| Table header bg | `#8E2A23` |
| Table header text | `#FFFFFF` |

### User Portal Colors

| Element | Value |
|---|---|
| Nav background | `#160C0A` |
| Surface background | `#FDFBF9` (off-white) |
| Border | `#E8DFD8` |
| Text primary | `#1A1714` |

### Typography
- Primary: "Jakarta"
- Secondary: "Outfit"
- Fallback: `system-ui, ui-sans-serif, sans-serif`

### Shadows
- `shadow-card` — subtle 2px depth
- `shadow-elevated` — medium 4px overlay depth
- `shadow-dropdown` — deep 8px modal depth

### Component Patterns
- **Buttons**: primary (wine fill), secondary (light fill), destructive (red)
- **Inputs**: focus ring in primary color, red border + message on error
- **Badges**: paired bg+text semantic colors
- **Cards**: border + subtle shadow, group related fields
- **Modals**: overlay with backdrop blur, fade-in
- **Tables**: alternating row bg `#F7F5F2`, wine-red header

---

## Folder Structure

```
app/
├── (user-facing)/          # Public registration portal
│   ├── layout.tsx          # Top nav + footer
│   ├── page.tsx            # Home — semester listing + hero
│   ├── semester/[id]/      # Semester detail page
│   ├── register/           # Multi-step registration wizard
│   ├── cart/               # Shopping cart
│   ├── profile/            # User account dashboard
│   ├── family/             # Family profile management
│   └── audition/           # Competition audition flow
├── admin/
│   ├── layout.tsx          # Sidebar + admin chrome (240px sidebar)
│   ├── semesters/          # Semester CRUD + 9-step editor
│   ├── classes/            # Class catalog management
│   ├── sessions/           # Session management
│   ├── emails/             # Email broadcast management
│   ├── payments/           # Payment tracking
│   ├── dancers/            # Dancer database
│   ├── families/           # Family records
│   ├── users/              # User/admin management
│   ├── media/              # Media library
│   ├── credits/            # Account credit management
│   └── profile/            # Admin profile + email signature
├── components/
│   ├── ui/                 # Base components (Button, Input, Card, Modal, Badge, PageHeader)
│   ├── public/             # User portal components
│   ├── semester-flow/      # Semester editor components
│   ├── email/              # Email preview components
│   └── media/              # Media picker modal
├── providers/              # AuthProvider, CartProvider, RegistrationProvider
└── globals.css             # CSS custom properties + Tailwind theme
```

---

## Admin Portal Pages

| Page | Purpose |
|---|---|
| `/admin` | Dashboard home |
| `/admin/semesters` | List semesters (status, registration count) |
| `/admin/semesters/new` | 9-step semester creation wizard |
| `/admin/semesters/[id]/edit` | Edit existing semester |
| `/admin/classes` | Class catalog with search/filter |
| `/admin/sessions` | Session table view |
| `/admin/emails` | Email broadcast list |
| `/admin/emails/new` | 4-step email creation flow |
| `/admin/payments` | Payment/installment dashboard |
| `/admin/dancers` | Dancer database with filters |
| `/admin/families` | Family records |
| `/admin/users` | User/admin account management |
| `/admin/media` | Media library (folder-based) |
| `/admin/credits` | Family credit management |
| `/admin/profile` | Admin profile + email signature |

---

## User Portal Pages

| Page | Purpose |
|---|---|
| `/` | Semester listing with hero + CTA |
| `/semester/[id]` | Session grid, add-to-cart, filter bar |
| `/register` | 5-step registration wizard |
| `/cart` | Cart review + checkout |
| `/profile` | Account dashboard (registrations, dancers, payments) |
| `/family` | Family info + dancer management |
| `/audition` | Competition track audition booking |

---

## Key Features Already Built

### Admin Portal
- **9-step semester editor**: Details → Classes/Sessions → Session Groups → Payment Plans → Discounts → Registration Form → Confirmation Email → Waitlist → Review/Publish
- **TipTap rich text editor**: Email-safe output, character limit, live preview, token substitution
- **4-step email broadcast flow**: Setup → Recipients → Design → Preview/Schedule
- **Email delivery tracking**: Per-recipient status via Resend webhooks (opened, clicked, bounced)
- **Media library**: Folder-based, image + PDF upload, picker modal
- **Discount management**: Multi-person, multi-session, custom rules with semester linking
- **Tuition engine**: Division-based progressive discounts, special programs, fee config
- **Payment schedule builder**: Auto-calculate installments with due dates
- **Search + filtering**: All major tables (emails, classes, dancers, families)
- **Dancer/family database**: Relational with linked accounts
- **Account credits**: Admin-issued family credit management
- **PDF attachments**: Attachable to forms and emails
- **Cron automation**: Waitlist processing, scheduled email dispatch, hold expiry

### User Portal
- **Multi-step registration wizard**: 5 steps with sessionStorage persistence
- **Shopping cart**: 20-minute TTL, expiry countdown, localStorage sync
- **Session filtering**: By discipline, division, day-of-week
- **Dynamic registration form**: Admin-configured at runtime with Zod schema generation
- **Waitlist system**: Position queue, email invitations, 48h acceptance window
- **Payment plans**: Pay-in-full, deposit, installment options
- **Promo codes**: Per-family caps, date-based, stackable rules
- **Conflict detection**: Time overlap validation during registration
- **Family accounts**: Multi-parent, multi-dancer

---

## Key Data Models

| Type | Description |
|---|---|
| `User` | Auth user (student, parent, admin) with role |
| `Family` | Household grouping users + dancers |
| `Dancer` | Child dancer with DOB, gender, registrations |
| `DanceClass` | Curriculum entity (discipline, division, competition track) |
| `ClassSession` | Time-slot with day, time, capacity, instructor |
| `Registration` | Enrollment (dancer → sessions, status, amount) |
| `WaitlistEntry` | Queue entry with position + invite state |
| `Email` | Broadcast email (draft/scheduled/sent) |
| `EmailDelivery` | Per-recipient delivery event tracking |
| `Discount` | Global discount rules |
| `DraftCoupon` | Promo code with caps + activation dates |

**Draft state types** (editor-only, in-memory):
- `SemesterDraft` — full semester being configured
- `DraftClass` — class with nested schedules + requirements
- `DraftClassSchedule` — schedule block that generates class_sessions
- `DraftTuitionRateBand` — division × weekly count → base tuition
- `DraftClassRequirement` — prerequisite/concurrent/audition/teacher-rec rule

---

## Admin Layout Structure

- **Sidebar**: 240px wide, dark brown (`#160C0A`), wine-red active links
- **Content area**: Warm off-white background (`#F7F5F2`)
- **Page header**: Title + breadcrumb via `PageHeader` component
- **Section cards**: `SectionCard` groups related form fields (white bg + border + shadow)
- **Tables**: Wine-red header, alternating row stripes, action buttons in last column

---

## Multi-step Editor Patterns

Two major multi-step flows exist:

**Semester Editor (9 steps)** — `/admin/semesters/new`
1. Details (name, dates, capacity warning)
2. Classes (curriculum catalog + nested schedules)
3. Session Groups (custom groupings)
4. Payment (installment plans + due dates)
5. Discounts (link global discount rules)
6. Registration Form (drag-drop field builder)
7. Confirmation Email (TipTap + token preview)
8. Waitlist (enable/configure)
9. Review (publish / schedule / save draft)

**Email Broadcast Editor (4 steps)** — `/admin/emails/new`
1. Setup (subject, from name, reply-to)
2. Recipients (target by semester/session or manual)
3. Design (TipTap editor + media attachments + PDF)
4. Preview & Schedule (send test, pick send time)

---

## Registration Flow (User Portal)

5-step wizard at `/register`:
1. Email verification (magic link)
2. Select participants (dancers in family)
3. Dynamic registration form (admin-configured fields)
4. Payment (choose plan, enter coupon code, see breakdown)
5. Success (confirmation + receipt)

State persisted to `sessionStorage` per step. Cart TTL is 20 minutes with countdown timer.

---

## Automation (Background)

- **pg_cron** triggers Supabase Edge Functions every minute
- **process-waitlist**: Expires 30-min seat holds, expires 48h invitations, invites next in queue
- **process-scheduled-emails**: Dispatches emails at their scheduled send time
- **send-email-broadcast**: Batch-sends to all recipients via Resend API

---

## Current Project Phase

The codebase follows a phased rollout:
- Phase 1: Class/session management
- Phase 2: Tuition pricing engine
- Phase 3: Enrollment validation (conflicts, prerequisites)
- Phase 4: Payment + coupon system
- Phase 5: Email/communication system
- Phase 6: Competition track (auditions, invites) — in progress

---

## Notes for UI Planning

- The admin sidebar is always 240px; content area fills remaining width
- Most admin pages follow: `PageHeader` → action bar (search + filters + CTA) → data table or card grid
- Forms are organized into `SectionCard` groups, not one long flat form
- Wine red (`#8E2A23`) is the only primary accent — use it sparingly for CTAs and active states
- The warm brown/off-white palette should feel "premium but approachable" — not cold or corporate
- Competition track features use the Mauve badge color to visually distinguish them
- Both portals share the same dark nav (`#160C0A`) for brand consistency
- Tables always have a wine-red header row — this is a strong visual signature
- Multi-step flows use a step indicator at the top (numbered, with active/complete states)

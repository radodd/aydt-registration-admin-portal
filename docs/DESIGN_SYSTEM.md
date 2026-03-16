# AYDT Design System

**Source of truth for all colors, fonts, spacing, and component classes.**
Live tokens are defined in [`app/globals.css`](../app/globals.css).

> **V2 is the active system.** V1 is archived at the bottom of this file for historical reference.
> Old V1 classes (`.btn-primary`, `.input`, `.card`, etc.) are kept as backward-compat aliases in
> `globals.css` during the migration period — do not add new usages of them.

---

## Table of Contents

1. [V2 — Active Design System](#v2--active-design-system)
   - [Portal Rules](#portal-rules)
   - [Shared Tokens](#shared-tokens)
   - [Admin Portal](#admin-portal-admin-)
   - [User Portal](#user-portal-user-)
   - [File Map](#file-map)
   - [Audit Greps](#audit-greps)
2. [V1 — Archived (Legacy Reference)](#v1--archived-legacy-reference)

---

# V2 — Active Design System

**Introduced:** 2026-03-16
**Convention:** every class is prefixed by portal — `.admin-*` | `.user-*` | shared (no prefix)
**CSS vars:** `--admin-*` | `--user-*` | `--shared-*`

---

## Portal Rules

| | Admin Portal | User Portal |
|--|--|--|
| **Class prefix** | `.admin-*` | `.user-*` |
| **CSS var prefix** | `--admin-*` | `--user-*` |
| **Font** | Plus Jakarta Sans (`font-sans`) | Outfit (`font-outfit`) |
| **Shell class** | `.admin-shell` | `.user-shell` |
| **Page bg** | `#F7F5F2` warm white | `#FBF6EC` cream/ivory |
| **Navigation** | Dark sidebar `#160C0A` fixed left | Dark top nav `#160C0A` sticky |
| **Table header** | Wine red `#8E2A23` white text | Gold tint `#F8EDCF` gold text |
| **Input fill** | Warm gray `#EDE9E4` → white focus | Cream `#F8F2E4` → ivory focus |
| **Input focus ring** | Wine red `#8E2A23` | Gold `#B8830A` |
| **Primary CTA** | `.admin-btn-primary` (wine red) | `.user-btn-primary` (wine red) |
| **Featured CTA** | — | `.user-btn-gold` (gold) |
| **Auth layout** | Split panel — wine red left / white right | Centered card — gold top bar |

---

## Shared Tokens

Shared tokens have no portal prefix and work identically in both portals.

### Primary Brand Color

| Token | Hex | Use |
|--|--|--|
| `primary-600` | `#8E2A23` | ★ CTAs, active states, focus rings |
| `primary-700` | `#7B1F1A` | Hover on primary-600 |
| `primary-800` | `#5C1713` | Dark text on light primary bg |
| `primary-900` | `#3D0E0B` | Deep headings |
| `--shared-primary` | `#8E2A23` | CSS var reference |

### Semantic Accents (Badges)

```
.badge               base pill
.badge-success       mint fill   #0A5A50 text
.badge-info          lavender    #5A2878 text
.badge-warning       mauve       #702858 text
.badge-neutral       sage        #20503A text
.badge-error         pale-rose   #802818 text
.badge-primary       primary-100 #7B1F1A text
```

### Toasts

```
.toast + .toast-success   #C8EEE2 bg  #0A5A50 text
.toast + .toast-error     #F4D4CE bg  #7A2018 text
.toast + .toast-warning   #FAECD0 bg  #7A4E08 text
.toast + .toast-info      #E0DCF4 bg  #3A3080 text
.toast-container          fixed bottom-right 360px
```

### Alert Banners

```
.shared-alert-error
.shared-alert-warning
.shared-alert-success
```

---

## Admin Portal (`.admin-*`)

### CSS Variables

```
--admin-sidebar-width        240px
--admin-sidebar-bg           #160C0A   deep maroon-black
--admin-sidebar-border       #221410
--admin-sidebar-text         #B8A8A4   inactive nav labels
--admin-sidebar-active       #8E2A23   active nav pill
--admin-page-bg              #F7F5F2   warm white content area
--admin-surface              #FFFFFF   cards, modals
--admin-surface-sub          #EDE9E4   inset sections
--admin-border               #DDD9D2   card borders
--admin-border-sub           #EDE9E4   inner dividers
--admin-text                 #201D18   primary body
--admin-text-muted           #736D65   secondary / meta
--admin-text-faint           #9E9890   placeholder, disabled
--admin-table-header-bg      #8E2A23   wine red header
--admin-table-header-text    #FFFFFF
--admin-table-row-alt        #F7F5F2   alternating row tint
--admin-table-border         #DDD9D2
--admin-card-accent          #8E2A23   3px top border on stat cards
```

### Layout

```
.admin-shell                 full-page wrapper — font + warm white bg
.admin-sidebar               fixed left sidebar, dark bg (#160C0A)
.admin-sidebar-logo          logo section at top of sidebar
.admin-sidebar-logo-title    "AYDT" text
.admin-sidebar-logo-sub      "Studio Admin" subtext
.admin-sidebar-nav           nav link container
.admin-sidebar-footer        user avatar + name at bottom
.admin-main                  content area (ml-[240px])
```

### Navigation

```
.admin-nav-item              inactive sidebar link
.admin-nav-item-active       active sidebar link (wine red pill)
```

### Page Structure

```
.admin-page-header           flex row — title + action button
.admin-page-title            text-xl
.admin-page-subtitle         muted subtext below title
```

### Cards

```
.admin-card                  white + border + shadow-card
.admin-card-elevated         white + shadow-elevated (no border)
.admin-card-flat             warm gray bg, no border
.admin-card-stat             white + border + 3px wine red top accent
.admin-stat-label            10px uppercase label
.admin-stat-value            24px number
.admin-stat-sub              12px supporting text
.admin-section-card          white + border, overflow:hidden (for tables/lists)
.admin-section-card-header   header row with border-bottom
.admin-section-card-title    section title text
```

### Buttons

```
.admin-btn-primary     #8E2A23 bg    white text       — save, submit, create
.admin-btn-secondary   primary-100   primary-800 text — supporting action
.admin-btn-warm        primary-200   primary-800 text — mid-weight standalone
.admin-btn-muted       primary-300   primary-800 text — low emphasis
.admin-btn-outline     transparent   wine red border+text
.admin-btn-ghost       transparent   #7B1F1A text
.admin-btn-danger      #DC2626       white text       — delete, destructive
.admin-btn-neutral     #EDE9E4       #38342E text     — filters, utility
.admin-btn-sm  / .admin-btn-lg
```

### Inputs

```
.admin-input           warm gray fill → white on focus, wine red ring
.admin-textarea        same as admin-input, resizable
.admin-select          same as admin-input, with dropdown caret
```

### Tables

```
.admin-table           wine red header row, white/warm-gray alternating rows
```

### Auth

```
.admin-auth-shell          full-page flex wrapper
.admin-auth-brand          wine red left panel (42% width, hidden on mobile)
.admin-auth-brand-eyebrow  small uppercase label
.admin-auth-brand-logo     AYDT logotype
.admin-auth-brand-tagline  headline copy
.admin-auth-brand-sub      supporting copy
.admin-auth-form-panel     white right panel
.admin-auth-form-title     form heading
.admin-auth-form-sub       form subheading
```

---

## User Portal (`.user-*`)

### CSS Variables

```
--user-nav-bg                #160C0A   same dark as admin sidebar
--user-nav-border            #2A1A16
--user-nav-text              #F0E8D8   inactive nav links (warm white)
--user-nav-active            #C9900A   active nav link (gold)
--user-page-bg               #FBF6EC   cream page background
--user-surface               #FFFDF5   card / panel background
--user-surface-sub           #F5EDD8   inset sections, hover states
--user-border                #E8DFC8   card borders, dividers
--user-border-sub            #F0E8D8   inner / subtle dividers
--user-text                  #201D18   primary body
--user-text-muted            #6A4A45   secondary / meta (warmer)
--user-text-faint            #A08880   placeholder, disabled
--user-gold                  #B8830A   main gold accent
--user-gold-light            #F8EDCF   banner bg, table header bg, tints
--user-gold-hover            #9A6E08   gold hover state
--user-table-header-bg       #F8EDCF   gold tint header
--user-table-header-text     #B8830A
--user-table-row-alt         #FBF6EC   alternating row tint
--user-table-border          #E8DFC8
```

### Layout

```
.user-shell                  full-page wrapper — Outfit font + cream bg
.user-topnav                 sticky dark top nav bar
.user-main                   max-w-5xl content area
```

### Navigation

```
.user-nav-link               inactive top nav link (dim warm white)
.user-nav-link-active        active top nav link (gold)
```

### Page Structure

```
.user-page-header            flex row — title + action button
.user-page-title             text-xl
.user-page-subtitle          muted subtext below title
```

### Cards

```
.user-card                   ivory surface + cream border
.user-card-elevated          ivory + cream border + shadow-card
.user-card-flat              cream surface-sub bg
.user-section-card           ivory + border, overflow:hidden
.user-section-card-header    header row with border-bottom
.user-section-card-title     section title text
```

### Welcome Banner

```
.user-banner                 gold-light bg banner wrapper
.user-banner-eyebrow         10px uppercase, gold text
.user-banner-title           18px heading
.user-banner-sub             12px supporting text
```

### Class Enrollment Cards

```
.user-class-card             ivory card
.user-class-card-title       class name
.user-class-card-sub         description
.user-class-card-footer      bottom row with meta + button
.user-class-card-meta        days / time small text
.user-spots-available        gold pill — "X spots left"
.user-spots-full             rose pill — "Full"
```

### Buttons

```
.user-btn-primary    #8E2A23 bg    white text    — enroll, pay, submit
.user-btn-gold       #B8830A bg    white text    — featured CTA
.user-btn-outline    transparent   wine red border+text
.user-btn-ghost      transparent   gold text     — tertiary
.user-btn-neutral    #E8DFC8       warm dark text — filters
.user-btn-sm  / .user-btn-lg
```

### Inputs

```
.user-input          cream fill → ivory on focus, gold ring
.user-textarea       same, resizable
.user-select         same, with dropdown caret
```

### Tables

```
.user-table          gold-light header row, ivory/cream alternating rows
```

### Auth

```
.user-auth-shell       cream full-page centered wrapper
.user-auth-card        ivory centered card, max-w-[360px]
.user-auth-gold-bar    3px gold bar at top of card (brand signature)
.user-auth-eyebrow     "AMERICAN YOUTH DANCE THEATER" label
.user-auth-title       "Welcome back"
.user-auth-sub         "Sign in to your student account"
.user-auth-divider     bottom divider for footer link
```

---

## File Map

```
app/globals.css                         ← V2 CSS vars + all component classes
tailwind.config.js                      ← content paths only (colors live in @theme in globals.css)
app/admin/layout.tsx                    ← admin shell + dark sidebar
app/(user-facing)/layout.tsx            ← user shell + dark topnav
app/components/ui/Toast.tsx             ← shared .toast-* classes
```

## Audit Greps

```bash
# No unlabeled Tailwind color drift
grep -r "bg-gray-\|text-gray-\|bg-indigo\|bg-blue-9" app/

# Admin pages must not use user-* classes
grep -r "user-btn\|user-input\|user-table" app/admin/

# User pages must not use admin-* classes
grep -r "admin-btn\|admin-input\|admin-table" "app/(user-facing)/"

# Find remaining V1 class usages to migrate
grep -r "\bbtn-primary\b\|\binput\b\|\bcard\b\|\bnav-item\b" app/ --include="*.tsx"
```

---
---

# V1 — Archived (Legacy Reference)

**Active:** project start → 2026-03-16
**Replaced by:** V2 portal-separated system above
**Status:** CSS classes kept as backward-compat aliases in `globals.css` during migration.
Do not use these in new code.

---

## V1 Brand Identity

**Neutral family:** Cool Rose Slate — desaturated violet-rose gray.
**Admin sidebar:** Glassmorphic — `bg-white/90 backdrop-blur-lg`.
**User portal background:** `#FFFFFF` plain white.

---

## V1 Color Palette

### Primary — Wine Red / Maroon (unchanged in V2)

| Token | Hex | Use |
|-------|-----|-----|
| `primary-600` | `#8E2A23` | Main CTAs |
| `primary-700` | `#7B1F1A` | Hover |
| `primary-800` | `#5C1713` | Dark text on light primary |
| `primary-900` | `#3D0E0B` | Deep headings |

### V1 Neutral — Cool Rose Slate

| Token | Hex | Use |
|-------|-----|-----|
| `neutral-50`  | `#F5F4F7` | Admin page bg |
| `neutral-100` | `#ECEAF0` | Input bg, secondary button |
| `neutral-200` | `#D8D5E2` | Card borders, dividers |
| `neutral-300` | `#BCBACC` | Disabled borders |
| `neutral-400` | `#918DAA` | Placeholder, muted icons |
| `neutral-500` | `#67637E` | Secondary text |
| `neutral-600` | `#4D4A62` | Body text |
| `neutral-700` | `#37344A` | Strong body text |
| `neutral-800` | `#201E33` | Headings |
| `neutral-900` | `#121120` | Max contrast |

> **Why changed:** Cool Rose Slate had a violet/indigo undertone that drifted away from
> the warm theatrical brand direction. V2 uses warm rose-gray neutrals (`#F7F5F2`, `#DDD9D2`)
> that harmonize with the wine red primary instead of competing with it.

### V1 Semantic Surface Tokens

| Variable | Value | Use |
|----------|-------|-----|
| `--color-surface` | `#FFFFFF` | Card bg |
| `--color-surface-subtle` | `#EDEAF2` | Inset sections |
| `--color-page-bg` | `#F5F4F7` | Admin bg |
| `--color-page-bg-user` | `#FFFFFF` | User bg |
| `--color-border` | `#D8D5E2` | Borders |
| `--sidebar-bg` | `rgba(255,255,255,0.94)` | Glassmorphic sidebar |
| `--sidebar-border` | `#DDDAE8` | Sidebar border |

---

## V1 Component Classes

### Buttons (unprefixed — now aliased to V2 in globals.css)

```
.btn-primary    → same color as .admin-btn-primary (wine red)
.btn-secondary  .btn-warm  .btn-muted  .btn-outline
.btn-ghost      .btn-danger  .btn-neutral
.btn-sm  .btn-lg
```

### Inputs

```
.input       bg-neutral-100 fill → bg-white on focus, wine red border
.textarea    same, resizable
.select      same, with caret
```

### Cards

```
.card          bg-white + border-neutral-200 + shadow-card
.card-elevated bg-white + shadow-elevated
.card-flat     bg-neutral-50
.card-accent   bg-white + border + 3px wine red top
```

### Navigation (Admin)

```
.nav-item        text-neutral-500, hover: bg-primary-50 text-primary-700
.nav-item-active bg-primary-600 text-white
```

V1 admin sidebar was glassmorphic (`bg-white/90 backdrop-blur-lg`).
V2 admin sidebar is dark (`#160C0A`) — see `.admin-sidebar` above.

### Page Header

```
.page-header    flex justify-between mb-6
.page-title     text-xl font-bold text-neutral-900
.page-subtitle  text-sm text-neutral-400
```

### Portal Distinction (V1)

| | Admin | User |
|-|-------|------|
| **Page bg** | `bg-neutral-50` (#F5F4F7) | `bg-white` (#FFFFFF) |
| **Sidebar** | Glassmorphic white `bg-white/90` | None — sticky topbar |
| **User nav** | — | White bg (`bg-white`) |

---

## V1 Admin Sidebar Spec

```
--sidebar-bg:     rgba(255, 255, 255, 0.94)
--sidebar-border: #DDDAE8
--sidebar-width:  240px
backdrop-filter:  blur(12px)

Active nav:  bg-primary-600 text-white rounded-lg
Hover nav:   bg-primary-50  text-primary-700 rounded-lg
Inactive:    text-neutral-500
```

---

## Do Not Touch (still applies in V2)

| Area | Reason |
|------|--------|
| TipTap email HTML output | Email-safe HTML — no Tailwind classes |
| `app/components/email/IPhoneFrame.tsx` | Simulates iPhone UI — specific dark grays intentional |
| `app/components/public/PreviewBanner.tsx` | Dev/preview amber is intentional for visibility |
| Dark mode CSS vars | Structure present; full dark UI not yet implemented |

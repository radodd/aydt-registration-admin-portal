# AYDT User Portal — Design System

**Version:** 2.0
**Last updated:** 2026-03-23
**CSS source:** `app/(user-facing)/portal.css`
**Scope:** All pages under `app/(user-facing)/`

---

## Table of Contents

1. [Overview](#overview)
2. [Typography](#typography)
3. [Color Palette](#color-palette)
4. [CSS Custom Properties](#css-custom-properties)
5. [Shadows & Radii](#shadows--radii)
6. [Layout & Shell](#layout--shell)
7. [Top Navigation](#top-navigation)
8. [Hero Section](#hero-section)
9. [Enrollment Banner](#enrollment-banner)
10. [Page Sections](#page-sections)
11. [Semester Cards](#semester-cards)
12. [CTA Section](#cta-section)
13. [Semester Detail Page](#semester-detail-page)
14. [Session Cards](#session-cards)
15. [Filter Bar](#filter-bar)
16. [Cart Drawer](#cart-drawer)
17. [Cart Page](#cart-page)
18. [Registration Flow](#registration-flow)
19. [Profile Page](#profile-page)
20. [Footer](#footer)
21. [Badges](#badges)
22. [Buttons (All Variants)](#buttons-all-variants)
23. [Form Controls](#form-controls)
24. [File Map](#file-map)

---

## Overview

The user-facing registration portal is a **standalone CSS system** in `portal.css`, completely independent from the admin portal's Tailwind-based classes. It uses pure CSS custom properties with semantic naming conventions.

**Design principles:**
- Warm, inviting feel with plum (`#7A4A72`) as the primary accent
- Wine red (`#8E2A23`) reserved for high-priority CTAs (enroll, pay)
- Off-white page background (`#FDFBF9`) — never stark white
- Dark navigation and footer (`#160C0A`) for contrast
- No Tailwind utility classes in user-facing pages — all styling via `portal.css`

**Class naming prefixes:**
| Prefix | Domain |
|--------|--------|
| `.pub-*` | Global portal elements (shell, hero, sections, footer) |
| `.topnav-*` | Top navigation bar |
| `.semester-*` | Homepage semester cards |
| `.sem-*` | Semester detail page (hero, filters, classes, sessions) |
| `.cart-*` | Cart page and cart nav button |
| `.reg-*` | Registration flow (steps, participants, payment) |
| `.dancer-*` | Dancer selection cards |
| `.order-*` | Order summary |
| `.cta-*` | Homepage call-to-action section |
| `.btn-*` | Contextual buttons (hero, nav, back, continue, etc.) |
| `.disc-*` | Discipline chips |
| `.profile-*` | Profile page tabs |

---

## Typography

### Fonts

| Role | Family | CSS Variable |
|------|--------|-------------|
| Body / UI text | **Plus Jakarta Sans** | `--pub-font-primary` |
| Headings / Display | **Outfit** | `--pub-font-secondary` |

### Scale

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Homepage hero title | 52px | 800 | Outfit |
| Semester hero title | 36px | 700 | Outfit |
| Section heading | 30px | 700 | Outfit |
| Cart page title | 28px | 700 | Outfit |
| Page title (registration) | 26px | 700 | Outfit |
| CTA card heading | 24px | 700 | Outfit |
| Empty state title | 22px | 600 | Outfit |
| Banner title | 18px | 500 | Jakarta |
| Section title (semester detail) | 18px | 600 | Outfit |
| Semester card title | 17px | 700 | Jakarta |
| Session price | 17px | 700 | Outfit |
| Default body text | 15px | 400 | Jakarta |
| Card body / descriptions | 14px | 400 | Jakarta |
| Nav links / buttons | 13px | 500–600 | Jakarta |
| Metadata / labels | 12px | 500–600 | Jakarta |
| Small labels / badges | 11px | 600–700 | Jakarta |
| Eyebrow labels | 10px–11px | 500 | Jakarta, uppercase |
| Badge dot labels | 9px–10px | 500 | Jakarta, uppercase |

### Line Heights

| Context | Line Height |
|---------|-------------|
| Tight (badges, labels) | 1.0 |
| Headings | 1.1–1.15 |
| Subheadings | 1.2–1.3 |
| Metadata | 1.4 |
| Body paragraphs | 1.55–1.65 |
| Footer details | 1.7 |

---

## Color Palette

### Primary Accent — Plum

| Token | Hex | Use |
|-------|-----|-----|
| `--plum` | `#7A4A72` | Primary accent — nav badge, hero buttons, form card borders |
| `--plum-50` | `#F7EEF6` | Light tint backgrounds (discipline chips, avatars, empty icons) |
| `--plum-100` | `#EDD8EB` | Lighter tint |
| `--plum-200` | `#C090B8` | Accent text on dark backgrounds (enrollment banner) |
| `--plum-700` | `#5E3458` | Darker accent text |
| `--plum-900` | `#3A1E38` | Deep dark text on plum surfaces |

### Secondary Brand — Wine Red

| Token | Hex | Use |
|-------|-----|-----|
| `--wine` | `#8E2A23` | High-priority CTA buttons (enroll, pay, submit) |
| `--wine-50` | `#F9EDEC` | Light tint |
| `--wine-100` | `#F0D0CE` | Light background |
| `--wine-200` | `#E0A09B` | Eyebrow text on dark hero sections |
| `--wine-700` | `#6B1F19` | Darker wine text |

### Navigation & Dark Surfaces

| Token | Hex | Use |
|-------|-----|-----|
| `--pub-nav-bg` | `#160C0A` | Topnav and footer background |
| `--pub-nav-border` | `#221410` | Nav bottom border |
| `--pub-nav-text` | `#B8A8A4` | Inactive nav text |

### Page & Surfaces

| Token | Hex | Use |
|-------|-----|-----|
| `--pub-page-bg` | `#FDFBF9` | Page background (warm off-white) |
| `--pub-surface` | `#FFFFFF` | Cards, panels |
| `--pub-surface-warm` | `#FAF7F4` | Warm off-white surfaces |
| `--pub-border` | `#E8DFD8` | Card borders, dividers |
| `--pub-border-subtle` | `#F0EBE6` | Light inner dividers |

### Text

| Token | Hex | Use |
|-------|-----|-----|
| `--pub-text-primary` | `#1A1714` | Primary body text |
| `--pub-text-muted` | `#786E65` | Secondary labels, metadata |
| `--pub-text-faint` | `#A09890` | Placeholders, disabled text, hints |

### Badge Status Colors

| Name | Background | Text |
|------|-----------|------|
| Sage (success/open) | `#D6EDD4` | `#1A5C16` |
| Amber (warning/limited) | `#FAECD0` | `#7A4E08` |
| Mint (info) | `#D4F0E8` | `#0A5A50` |
| Lavender (secondary) | `#E8E4F8` | `#3A3080` |
| Rose (attention/full) | `#F5E4E4` | `#7A2018` |

---

## CSS Custom Properties

All defined in `:root` within `portal.css`.

```
/* Brand Colors */
--plum:           #7A4A72
--plum-50:        #F7EEF6
--plum-100:       #EDD8EB
--plum-200:       #C090B8
--plum-700:       #5E3458
--plum-900:       #3A1E38

--wine:           #8E2A23
--wine-50:        #F9EDEC
--wine-100:       #F0D0CE
--wine-200:       #E0A09B
--wine-700:       #6B1F19

/* Navigation */
--pub-nav-bg:         #160C0A
--pub-nav-border:     #221410
--pub-nav-text:       #B8A8A4

/* Surfaces */
--pub-page-bg:        #FDFBF9
--pub-surface:        #FFFFFF
--pub-surface-warm:   #FAF7F4
--pub-border:         #E8DFD8
--pub-border-subtle:  #F0EBE6

/* Text */
--pub-text-primary:   #1A1714
--pub-text-muted:     #786E65
--pub-text-faint:     #A09890

/* Badges */
--pub-badge-sage-bg:       #D6EDD4
--pub-badge-sage-text:     #1A5C16
--pub-badge-amber-bg:      #FAECD0
--pub-badge-amber-text:    #7A4E08
--pub-badge-mint-bg:       #D4F0E8
--pub-badge-mint-text:     #0A5A50
--pub-badge-lavender-bg:   #E8E4F8
--pub-badge-lavender-text: #3A3080
--pub-badge-rose-bg:       #F5E4E4
--pub-badge-rose-text:     #7A2018
```

---

## Shadows & Radii

### Shadows

| Token | Value | Use |
|-------|-------|-----|
| `--pub-shadow-card` | `0 1px 4px rgba(26,23,20,0.07), 0 1px 2px rgba(26,23,20,0.04)` | Default card elevation |
| `--pub-shadow-elevated` | `0 4px 16px rgba(26,23,20,0.10), 0 2px 4px rgba(26,23,20,0.05)` | Modals, drawers |
| `--pub-shadow-plum` | `0 4px 20px rgba(122,74,114,0.18), 0 1px 4px rgba(26,23,20,0.06)` | Plum-tinted emphasis |

### Border Radii

| Token | Value | Use |
|-------|-------|-----|
| `--pub-radius-sm` | `4px` | Small elements |
| `--pub-radius-md` | `8px` | Buttons, inputs |
| `--pub-radius-lg` | `12px` | Cards, panels |
| `--pub-radius-xl` | `16px` | Large cards |
| `--pub-radius-2xl` | `20px` | Hero sections |
| `--pub-radius-pill` | `999px` | Badges, pills |

---

## Layout & Shell

### `.pub-portal-shell`
Root wrapper for all user-facing pages.

```
min-height: 100vh
font-family: var(--pub-font-primary)   → Plus Jakarta Sans
background: var(--pub-page-bg)         → #FDFBF9
color: var(--pub-text-primary)         → #1A1714
font-size: 15px
line-height: 1.6
display: flex, flex-direction: column
```

---

## Top Navigation

### `.topnav`
Sticky dark navigation bar.

```
background: var(--pub-nav-bg)          → #160C0A
height: 66px
position: sticky, top: 0, z-index: 50
border-bottom: 1px solid var(--pub-nav-border)
```

### Sub-Components

| Class | Description |
|-------|-------------|
| `.topnav-logo` | Logo wrapper — flex, gap 10px |
| `.topnav-logo-mark` | Square badge (30x30px) — plum background, white initials |
| `.topnav-logo-text` | "AYDT" — 14px Outfit, white, 600 weight |
| `.topnav-logo-sub` | "Registration Portal" — 10px, faint |
| `.topnav-links` | Nav link container — flex, gap 2px |
| `.topnav-link` | Nav link — 13px, 500 weight, dim warm white |
| `.topnav-link.active` | Active link — white text |
| `.topnav-right` | Right section — ml-auto, flex |
| `.btn-nav-ghost` | Ghost nav button — gray border, transparent bg |
| `.btn-nav-primary` | Primary nav button — plum bg, white text |
| `.cart-nav-btn` | Cart button in nav — 13px, icon + count |
| `.cart-nav-badge` | Cart notification dot — 18x18px plum circle |

---

## Hero Section

### Homepage Hero (`.pub-hero`)

```
Dark gradient background with subtle pattern overlay
Padding: 72px top, 64px bottom
```

| Class | Description |
|-------|-------------|
| `.pub-hero-inner` | Max-width 1160px centered |
| `.pub-hero-content` | Max-width 680px content area |
| `.pub-hero-eyebrow` | Uppercase label with left accent line — plum-200 |
| `.pub-hero-title` | 52px, Outfit, 800 weight, white |
| `.pub-hero-desc` | 16px, light gray text |
| `.pub-hero-actions` | Flex wrapper for CTA buttons |
| `.pub-hero-divider` | "or" divider between buttons |
| `.btn-hero-primary` | Plum bg with 2px plum border, white text |
| `.btn-hero-ghost` | Ghost button on dark background |

### Semester Hero (`.sem-hero`)

```
Dark gradient — padding 44px vertical
```

| Class | Description |
|-------|-------------|
| `.sem-hero-inner` | Max-width 1080px centered |
| `.sem-hero-eyebrow` | Date range — 11px, wine-200 color |
| `.sem-hero-title` | 36px, Outfit, 700 weight, white |
| `.sem-hero-desc` | 14px, light gray |
| `.sem-hero-pills` | Payment option pills container |
| `.sem-hero-pill` | Individual pill — 11px, 700 weight |

---

## Enrollment Banner

Conditional status banner below hero when registration is open.

| Class | Description |
|-------|-------------|
| `.enrollment-banner` | Dark gradient bar with pulsing indicator |
| `.enrollment-banner-dot` | 7x7px pulsing green dot |
| `.enrollment-banner-text` | 13px, 600 weight, plum-200 color |
| `.enrollment-banner-link` | White text with bottom border underline |

---

## Page Sections

### `.pub-section`
Standard page section — 64px vertical padding.

| Class | Description |
|-------|-------------|
| `.pub-section` | Base section, 64px padding |
| `.pub-section.alt` | Light warm background variant |
| `.pub-section-inner` | Max-width 1160px centered |
| `.pub-section-eyebrow` | Uppercase label with plum accent line |
| `.pub-section-title` | 30px, Outfit, 700 weight |
| `.pub-section-desc` | 15px, muted text |
| `.pub-section-head-row` | Flex header with spacing |

---

## Semester Cards

Homepage grid of available semesters.

### `.semester-grid`
3-column grid layout, 20px gap.

### `.semester-card`
Individual semester card with hover effects.

| Class | Description |
|-------|-------------|
| `.semester-card` | Rounded card with border, shadow, hover lift |
| `.semester-card-header` | Plum-50 background section, 20px padding |
| `.semester-card-header.closed` | Dimmed variant for closed semesters |
| `.semester-card-header-row` | Flex row — title + badge |
| `.semester-card-title` | 17px, 700 weight |
| `.semester-badge` | Status pill (open/closed) |
| `.semester-badge.open` | Sage green — with dot |
| `.semester-badge.closed` | Amber orange — with dot |
| `.semester-card-dates` | 12px, muted text |
| `.semester-card-body` | Discipline chips area |
| `.disc-chip` | Discipline label pill (e.g., "Ballet", "Tap") |
| `.semester-card-footer` | Stats row — class count |
| `.semester-stat` | Centered stat (number + label) |
| `.semester-stat-val` | 17px, Outfit, 700 weight |
| `.semester-stat-val.plum` | Plum-colored variant |
| `.semester-stat-label` | 9px, uppercase |
| `.btn-view-sessions` | Primary CTA — plum bg |
| `.btn-view-sessions.ghost` | Disabled/closed variant |

---

## CTA Section

Homepage call-to-action — 2-column split layout.

| Class | Description |
|-------|-------------|
| `.cta-split` | 2-column grid |
| `.cta-card` | Card base — 36px padding, flex column |
| `.cta-card.returning` | Dark background with gradient |
| `.cta-card.new-family` | Plum-50 light background |
| `.cta-label` | Uppercase section label |
| `.cta-title` | 24px, Outfit heading |
| `.cta-body` | 14px description |
| `.btn-cta-dark` | Primary button on dark card |
| `.btn-cta-outline-dark` | Ghost outline on dark card |
| `.btn-cta-plum` | Plum button on light card |
| `.btn-cta-ghost-plum` | Ghost outline on light card |

---

## Semester Detail Page

### Class Cards (Accordion)

| Class | Description |
|-------|-------------|
| `.sem-class-card` | Expandable card — rounded, bordered |
| `.sem-class-card.open` | Expanded state |
| `.sem-class-card-top` | Header button — click to expand |
| `.sem-disc-stripe` | 4px colored left stripe (per discipline) |
| `.sem-class-name` | 15px, Outfit, 700 weight |
| `.sem-class-meta-row` | Metadata row (age, level, instructor) |
| `.sem-class-meta-item` | Single metadata — 11px, muted |
| `.sem-class-desc` | Description — 12px |
| `.sem-session-count` | Right-aligned count container |
| `.sem-session-num` | Number — 18px, Outfit, 700 weight |
| `.sem-session-label` | "Sessions" — 10px, uppercase |
| `.sem-chevron` | Rotation chevron icon |

---

## Session Cards

Individual session cards inside class accordions.

| Class | Description |
|-------|-------------|
| `.sem-sc` | Session card — 14px padding, 1.5px border |
| `.sem-sc.in-cart` | Highlighted when added to cart |
| `.sem-sc.full` | Grayed out (opacity 0.62) |
| `.sem-sc-days` | Days label — 13px, Outfit, 700 weight |
| `.sem-sc-time` | Time — 12px, muted |
| `.sem-sc-meta-row` | Metadata line (location, instructor) |
| `.sem-cap-bar` | Capacity progress bar (4px height) |
| `.sem-cap-fill` | Filled portion — dynamic width |
| `.sem-cap-fill.warn` | Amber warning state |
| `.sem-cap-fill.danger` | Red danger state |
| `.sem-cap-label` | Capacity text — 10px, faint |
| `.sem-sc-price` | Price — 17px, Outfit, 700 weight |
| `.sem-sc-price-sub` | Per-session note — 10px |
| `.sem-atc` | "Add to Cart" button — 11px, 700 weight |
| `.sem-atc.incart` | "In Cart" variant |
| `.sem-atc.waitlist` | Waitlist variant |

---

## Filter Bar

Sticky filter bar on semester detail page.

| Class | Description |
|-------|-------------|
| `.sem-filter-bar` | Sticky container — top: 66px, z-index: 40 |
| `.sem-filter-group` | Filter group — flex column, gap 5px |
| `.sem-filter-label` | Group label — 10px, uppercase |
| `.sem-filter-pills` | Pill options flex wrapper |
| `.sem-fpill` | Filter pill — 12px, 600 weight |
| `.sem-fpill.active` | Active filter state |
| `.sem-filter-sep` | Vertical divider |
| `.sem-spots-check` | Checkbox for availability filter |
| `.sem-filter-count` | Result count — right-aligned |

---

## Cart Drawer

Fixed right-side drawer on semester detail page.

| Class | Description |
|-------|-------------|
| `.sem-cart-drawer` | Fixed right — 380px width, z-index 150 |
| `.sem-cart-drawer.hidden` | Hidden — translateX(100%) |
| `.sem-cd-header` | Header — title + count + close |
| `.sem-cd-title` | "Your Cart" — 15px, Outfit |
| `.sem-cd-count` | Item count badge — 22x22px circle |
| `.sem-cd-close` | Close button — 28x28px |
| `.sem-cd-ttl` | Time-to-live badge (amber) |
| `.sem-cd-items` | Scrollable items list |
| `.sem-cd-item` | Item container — warm bg, rounded |
| `.sem-cd-disc` | Discipline badge — 36x36px |
| `.sem-cd-name` | Session name — 13px, 700 weight |
| `.sem-cd-price` | Price — 14px, Outfit, plum color |
| `.sem-cd-remove` | Remove link — 10px, 600 weight |
| `.sem-cd-summary` | Summary section — border-top |
| `.sem-cd-summary-total` | Total — 18px, plum, Outfit |
| `.sem-cd-cta` | "Proceed to Payment" button |
| `.sem-cd-browse` | "Continue Shopping" link |

---

## Cart Page

Full cart review page before checkout.

| Class | Description |
|-------|-------------|
| `.cart-page-main` | Main container — flex: 1, padding 48px |
| `.cart-page-inner` | Max-width 760px centered |
| `.cart-page-title` | "Review Your Cart" — 28px, Outfit |
| `.cart-ttl` | Time-to-live badge (urgent/warning variants) |
| `.cart-breadcrumb` | Navigation breadcrumb — 12px |
| `.cart-section-label` | Section heading — uppercase |
| `.cart-item` | Item container — flex, shadow |
| `.cart-item-disc` | Discipline icon — 42x42px, plum-50 bg |
| `.cart-item-name` | Session name — 15px, Outfit, 700 weight |
| `.cart-item-meta-row` | Metadata line — 12px |
| `.cart-item-price` | Price — 18px, Outfit |
| `.cart-item-remove` | Remove link |
| `.order-card` | Summary card — rounded, shadow |
| `.order-card-header` | "Order Summary" — 14px, 700 weight |
| `.order-line` | Line item — flex space-between |
| `.order-total-amount` | Final total — 26px, plum |
| `.cart-cta-row` | 1fr 2fr grid for back/continue |
| `.btn-back` | Back button — border, gray |
| `.btn-continue` | Continue button — plum primary |
| `.cart-empty-state` | Empty cart centered container |

---

## Registration Flow

### Step Indicator

| Class | Description |
|-------|-------------|
| `.cart-steps-bar` | Sticky progress bar container |
| `.reg-steps` | Step circles flex row |
| `.reg-step` | Single step — flex column, centered |
| `.reg-step-circle` | Circle badge — 38x38px, 2px border |
| `.reg-step.done` | Completed step — plum fill |
| `.reg-step.active` | Current step — plum border |
| `.reg-step-label` | Step label — 11px, 600 weight |

### Participants Page

| Class | Description |
|-------|-------------|
| `.reg-page-wrap` | Main container — max-width 860px |
| `.reg-page-layout` | 2-column grid (1fr 280px) |
| `.reg-page-title` | 26px, Outfit, 700 weight |
| `.dancer-card` | Dancer option — flex, 1.5px border |
| `.dancer-card.selected` | Selected — plum border, 2px |
| `.dancer-avatar` | Avatar — 42x42px, plum-50 bg |
| `.dancer-name` | Name — 14px, 700 weight |
| `.dancer-check` | Checkmark — 22x22px, plum circle |
| `.reg-form-card` | Add dancer form — plum border, shadow |
| `.reg-input` | Registration input — 1.5px border, plum focus ring |
| `.reg-grid-2` | 2-column field grid |
| `.reg-add-dancer-btn` | "+ Add Dancer" — dashed border button |

### Order Summary Sidebar

| Class | Description |
|-------|-------------|
| `.reg-summary-card` | Sticky sidebar — position: sticky |
| `.reg-summary-item` | Single item — flex, 12px padding |
| `.reg-summary-disc` | Discipline badge — 34x34px |
| `.reg-summary-dancer` | Assigned dancer — plum text |
| `.reg-summary-dancer.unassigned` | Unassigned — amber text |
| `.reg-summary-total-val` | Total — 15px, plum, Outfit |

### Payment Page

| Class | Description |
|-------|-------------|
| `.reg-timer-bar` | Yellow warning bar at top |
| `.reg-timer-bar.urgent` | Red urgent variant |
| `.reg-timer-count` | Countdown — 13px, 700 weight |
| `.reg-email-wrap` | Form wrapper — max-width 540px |
| `.reg-email-input` | Email input — 13px padding, plum focus |
| `.reg-email-submit` | Submit — full width, plum bg |

### Fixed Bottom Nav

| Class | Description |
|-------|-------------|
| `.reg-bottom-bar` | Fixed bottom — z-index: 50 |
| `.reg-bottom-inner` | Inner flex — max-width 860px |

---

## Profile Page

| Class | Description |
|-------|-------------|
| `.profile-tab-btn` | Tab button — 13px, no border except bottom |
| `.profile-tab-btn.active` | Active tab — 2px plum bottom border, 600 weight |

---

## Footer

### `.pub-footer`
Dark footer matching the navigation.

| Class | Description |
|-------|-------------|
| `.pub-footer` | Dark background — `#160C0A` |
| `.pub-footer-inner` | Max-width 1160px centered |
| `.pub-footer-top` | 4-column grid (1.6fr 1fr 1fr 1.4fr) |
| `.pub-footer-logo` | Logo + mark |
| `.pub-footer-logo-mark` | 30x30px plum badge |
| `.pub-footer-tagline` | 13px, muted |
| `.pub-footer-col-title` | Column heading — 11px, uppercase |
| `.pub-footer-links` | Vertical link list |
| `.pub-footer-link` | Individual link |
| `.pub-footer-social-btn` | Social icon button — 32x32px |
| `.pub-footer-location-name` | Location name — 12px, 700 weight, white |
| `.pub-footer-location-detail` | Address lines |
| `.pub-footer-location-hours` | Hours — italic, 11px |
| `.pub-footer-bottom` | Bottom bar — copyright, legal links |

---

## Badges

Portal-specific status badges.

| Class | Background | Text | Use |
|-------|-----------|------|-----|
| `.sem-badge-sage` | `#D6EDD4` | `#1A5C16` | Open / available |
| `.sem-badge-amber` | `#FAECD0` | `#7A4E08` | Limited / warning |
| `.sem-badge-rose` | `#F5E4E4` | `#7A2018` | Full / attention |
| `.semester-badge.open` | Sage variant | | Homepage semester status |
| `.semester-badge.closed` | Amber variant | | Homepage semester status |

All badges: `inline-flex items-center`, pill-shaped (`border-radius: 999px`).

---

## Buttons (All Variants)

### Navigation Buttons

| Class | Background | Text | Use |
|-------|-----------|------|-----|
| `.btn-nav-ghost` | Transparent | Gray | Sign in, profile |
| `.btn-nav-primary` | Plum | White | Register CTA in nav |

### Hero Buttons

| Class | Background | Text | Use |
|-------|-----------|------|-----|
| `.btn-hero-primary` | Plum + 2px border | White | Main hero CTA |
| `.btn-hero-ghost` | Transparent | Dim white | Secondary hero CTA |

### CTA Section Buttons

| Class | Background | Text | Use |
|-------|-----------|------|-----|
| `.btn-cta-dark` | Plum | White | Dark card CTA |
| `.btn-cta-outline-dark` | Transparent | Dim white | Dark card secondary |
| `.btn-cta-plum` | Plum | White | Light card CTA |
| `.btn-cta-ghost-plum` | Transparent | Plum | Light card secondary |

### Semester & Cart Buttons

| Class | Background | Text | Use |
|-------|-----------|------|-----|
| `.btn-view-sessions` | Plum | White | View semester details |
| `.sem-atc` | Plum | White | Add to cart |
| `.btn-continue` | Plum | White | Cart/reg continue |
| `.btn-back` | Bordered | Gray text | Cart/reg back |
| `.sem-cd-cta` | Plum | White | Proceed to payment |

### Common Button Properties

```
border-radius: var(--pub-radius-md) → 8px
font-weight: 600–700
transition: 0.12s–0.15s
cursor: pointer
```

---

## Form Controls

### `.reg-input`
Registration form text input.

```
padding: 9px 12px
border: 1.5px solid var(--pub-border)
border-radius: var(--pub-radius-md)
font-size: 13px
Focus: border-color var(--plum), box-shadow 0 0 0 3px rgba(122,74,114,0.10)
```

### `.reg-email-input`
Email input (registration initiation).

```
padding: 13px
border: 1.5px solid var(--pub-border)
border-radius: var(--pub-radius-md)
font-size: 14px
Focus: plum border + focus ring
```

---

## File Map

```
app/(user-facing)/portal.css            ← All user portal CSS vars + component classes
app/(user-facing)/layout.tsx             ← Portal shell + topnav + footer
app/(user-facing)/ConditionalFooter.tsx  ← Footer component
app/(user-facing)/page.tsx               ← Homepage (hero, semesters, CTA)
app/(user-facing)/semester/[id]/SemesterPageContent.tsx  ← Semester detail
app/(user-facing)/cart/CartPageContent.tsx               ← Cart review
app/(user-facing)/register/layout.tsx                    ← Step indicator
app/(user-facing)/register/participants/page.tsx         ← Dancer selection
app/(user-facing)/register/payment/page.tsx              ← Payment
app/(user-facing)/profile/page.tsx                       ← Profile
app/components/public/ClassCard.tsx      ← Class accordion + session cards
app/components/public/CartDrawer.tsx     ← Semester page cart drawer
app/components/public/FilterBar.tsx      ← Semester page filter bar
app/components/public/SessionGrid.tsx    ← Session grid layout
```

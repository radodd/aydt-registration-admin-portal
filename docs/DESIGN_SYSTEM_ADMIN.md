# AYDT Admin Portal — Design System

**Version:** 2.0
**Last updated:** 2026-03-23
**CSS source:** `app/globals.css`
**Scope:** All pages under `app/admin/`

---

## Table of Contents

1. [Overview](#overview)
2. [Typography](#typography)
3. [Color Palette](#color-palette)
4. [CSS Custom Properties](#css-custom-properties)
5. [Layout & Shell](#layout--shell)
6. [Navigation](#navigation)
7. [Page Structure](#page-structure)
8. [Cards](#cards)
9. [Buttons](#buttons)
10. [Form Controls](#form-controls)
11. [Tables](#tables)
12. [Badges](#badges)
13. [Toasts](#toasts)
14. [Alert Banners](#alert-banners)
15. [Shadows & Elevation](#shadows--elevation)
16. [File Map](#file-map)

---

## Overview

The admin portal uses a **warm, professional aesthetic** with a dark sidebar, wine red accents, and warm neutral surfaces. All admin-specific classes are prefixed `.admin-*` and all admin CSS variables are prefixed `--admin-*`. Shared components (badges, toasts, alerts) have no prefix.

**Design principles:**
- Dark sidebar navigation with wine red active states
- Warm white content area (`#F7F5F2`) — never stark white
- Wine red (`#8E2A23`) as the singular brand accent
- Warm gray neutral scale with brown undertones
- Consistent 0.5px borders, `rounded-xl` corners, subtle card shadows

---

## Typography

### Font

| Role | Family | CSS Reference |
|------|--------|---------------|
| All text | **Plus Jakarta Sans** | `var(--font-jakarta), system-ui, sans-serif` |

Applied via `.admin-shell` on the root wrapper.

### Scale

| Element | Size | Weight | Style |
|---------|------|--------|-------|
| Page title | 20px (`text-xl`) | 500 (medium) | — |
| Stat value | 24px (`text-2xl`) | 500 | — |
| Section card title | 14px (`text-sm`) | 500 | — |
| Button text | 14px (`text-sm`) | 600 (semibold) | — |
| Body text | 14px (`text-sm`) | 400 | — |
| Input text | 14px (`text-sm`) | 400 | — |
| Sidebar nav | 14px (`text-sm`) | 400 / 500 active | — |
| Sidebar logo | 14px (`text-sm`) | 500 | `tracking-widest` |
| Table header | 10px | 500 | Uppercase, `letter-spacing: 0.05em` |
| Stat label | 10px | 500 | Uppercase, `letter-spacing: 0.04em` |
| Muted subtext | 14px (`text-sm`) | 400 | Color: `--admin-text-faint` |

### Heading Weights

All headings (`h1`–`h6`) default to `font-weight: 500` via the base layer.

---

## Color Palette

### Primary Brand — Wine Red

| Token | Hex | Use |
|-------|-----|-----|
| `primary-50` | `#FDF2F1` | Hover tint (outline buttons) |
| `primary-100` | `#F2E7E4` | Light backgrounds, avatar bg, secondary btn |
| `primary-200` | `#E6D5D1` | Secondary btn hover |
| `primary-600` | `#8E2A23` | **Primary CTA, active states, focus rings, table headers** |
| `primary-700` | `#7B1F1A` | Hover on primary-600, dark accent text |
| `primary-800` | `#5C1713` | Dark text on light primary backgrounds |
| `primary-900` | `#3D0E0B` | Maximum contrast headings |

### Warm Neutrals

| Token / Hex | Use |
|-------------|-----|
| `#201D18` — `--admin-text` | Primary body text |
| `#736D65` — `--admin-text-muted` | Secondary labels, metadata |
| `#9E9890` — `--admin-text-faint` | Placeholders, disabled text, hints |
| `#DDD9D2` — `--admin-border` | Card borders, dividers |
| `#EDE9E4` — `--admin-surface-sub` | Inset sections, secondary surfaces, input fill |
| `#F7F5F2` — `--admin-page-bg` | Page background |
| `#FFFFFF` — `--admin-surface` | Cards, modals, input focus |

### Sidebar

| Token / Hex | Use |
|-------------|-----|
| `#160C0A` — `--admin-sidebar-bg` | Sidebar background (deep maroon-black) |
| `#221410` — `--admin-sidebar-border` | Sidebar border, hover bg |
| `#B8A8A4` — `--admin-sidebar-text` | Inactive nav label text |
| `#8E2A23` — `--admin-sidebar-active` | Active nav pill background |
| `#FFFFFF` | Active nav text, hover text |

### Semantic Accent Colors (Badges)

| Name | Background | Text |
|------|-----------|------|
| Success (Mint) | `rgba(125,206,194,.18)` | `#0A5A50` |
| Info (Lavender) | `rgba(196,160,212,.18)` | `#5A2878` |
| Warning (Mauve) | `rgba(212,160,192,.18)` | `#702858` |
| Neutral (Sage) | `rgba(158,196,180,.18)` | `#20503A` |
| Error (Pale Rose) | `rgba(232,184,176,.18)` | `#802818` |
| Primary | `#F2E7E4` | `#7B1F1A` |

### Toast Colors

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| Success | `#C8EEE2` | `#0A5A50` | `rgba(10,90,80,0.25)` |
| Error | `#F4D4CE` | `#7A2018` | `rgba(122,32,24,0.25)` |
| Warning | `#FAECD0` | `#7A4E08` | `rgba(122,78,8,0.25)` |
| Info | `#E0DCF4` | `#3A3080` | `rgba(58,48,128,0.25)` |

---

## CSS Custom Properties

All defined in `:root` within `app/globals.css`.

### Admin-Specific (`--admin-*`)

```
--admin-sidebar-width:      240px
--admin-sidebar-bg:         #160C0A
--admin-sidebar-border:     #221410
--admin-sidebar-text:       #B8A8A4
--admin-sidebar-active:     #8E2A23
--admin-sidebar-hover:      #221410

--admin-page-bg:            #F7F5F2
--admin-surface:            #FFFFFF
--admin-surface-sub:        #EDE9E4
--admin-border:             #DDD9D2
--admin-border-sub:         #EDE9E4

--admin-text:               #201D18
--admin-text-muted:         #736D65
--admin-text-faint:         #9E9890

--admin-table-header-bg:    #8E2A23
--admin-table-header-text:  #FFFFFF
--admin-table-row-alt:      #F7F5F2
--admin-table-border:       #DDD9D2

--admin-card-accent:        #8E2A23
```

### Shared (`--shared-*`)

```
--shared-primary:           #8E2A23
--shared-primary-hover:     #7B1F1A
--shared-focus-ring:        rgba(142, 42, 35, 0.12)
--shared-border-focus:      #8E2A23
```

---

## Layout & Shell

### `.admin-shell`
Root wrapper for all admin pages. Sets font, background, and text color.

```
min-height: 100vh
font-family: Plus Jakarta Sans
background: var(--admin-page-bg)       → #F7F5F2
color: var(--admin-text)               → #201D18
```

### `.admin-sidebar`
Fixed left sidebar — dark background with wine red active states.

```
position: fixed, top: 0, left: 0, height: 100%
background: var(--admin-sidebar-bg)    → #160C0A
border-right: 1px solid var(--admin-sidebar-border)
z-index: 30
Width: 240px expanded / 52px collapsed (controlled by inline style)
```

### Sidebar Sub-Components

| Class | Description |
|-------|-------------|
| `.admin-sidebar-logo` | Logo area at top, `px-5 py-5`, bottom border |
| `.admin-sidebar-logo-title` | "AYDT" — white, `text-sm`, `tracking-widest` |
| `.admin-sidebar-logo-sub` | "Studio Admin" — `--admin-sidebar-text` color |
| `.admin-sidebar-nav` | Scrollable nav container, `flex-col gap-0.5` |
| `.admin-sidebar-footer` | User profile + sign out, top border |

### Content Area

The main content area uses `flex` + `margin-left` matching sidebar width, with `px-8 py-8` padding. This is applied inline rather than through a class.

---

## Navigation

### `.admin-nav-item`
Inactive sidebar link.

```
flex items-center gap-2.5 px-3 py-2 rounded-lg
color: var(--admin-sidebar-text)       → #B8A8A4
hover: background rgba(255,255,255,0.06), color: #FFFFFF
```

### `.admin-nav-item-active`
Current page indicator — wine red pill.

```
flex items-center gap-2.5 px-3 py-2 rounded-lg
background: var(--admin-sidebar-active) → #8E2A23
color: #FFFFFF
font-weight: 500
```

---

## Page Structure

| Class | Description |
|-------|-------------|
| `.admin-page-header` | `flex justify-between mb-6` — title + action button row |
| `.admin-page-title` | `text-xl font-medium` — color: `--admin-text` |
| `.admin-page-subtitle` | `text-sm` — color: `--admin-text-faint` |

---

## Cards

### `.admin-card`
Standard content card.

```
background: var(--admin-surface)       → #FFFFFF
border: 0.5px solid var(--admin-border) → #DDD9D2
border-radius: rounded-xl
box-shadow: shadow-card
```

### `.admin-card-stat`
Metric/KPI card with wine red top accent.

```
Same as admin-card, plus:
border-top: 3px solid var(--admin-card-accent) → #8E2A23
padding: 1rem (p-4)
```

### Stat Card Sub-Components

| Class | Description |
|-------|-------------|
| `.admin-stat-label` | 10px uppercase, `letter-spacing: 0.04em`, faint color |
| `.admin-stat-value` | `text-2xl font-medium mt-1.5` |
| `.admin-stat-sub` | `text-xs mt-1`, muted color |

### `.admin-section-card`
Card with header/body separation, used for tables and lists.

```
background: var(--admin-surface)
border: 0.5px solid var(--admin-border)
rounded-xl, overflow: hidden
```

| Class | Description |
|-------|-------------|
| `.admin-section-card-header` | `px-5 py-4 flex justify-between`, bottom border |
| `.admin-section-card-title` | `text-sm font-medium` |

---

## Buttons

All buttons share: `inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer` with `padding: 8px 16px`.

| Class | Background | Text | Border | Use |
|-------|-----------|------|--------|-----|
| `.admin-btn-primary` | `#8E2A23` → hover `#7B1F1A` | White | None | Save, submit, create |
| `.admin-btn-secondary` | `#F2E7E4` → hover `#E6D5D1` | `#5C1713` | None | Supporting action |
| `.admin-btn-outline` | Transparent → hover `#FDF2F1` | `#8E2A23` | `1px solid #8E2A23` | Cancel, back |
| `.admin-btn-neutral` | `#EDE9E4` → hover `#DDD9D2` | `#38342E` | None | Filters, utility |

### Size Modifier

| Class | Font Size | Padding |
|-------|-----------|---------|
| `.admin-btn-sm` | 12px | `6px 12px` |
| (default) | 14px | `8px 16px` |

---

## Form Controls

### `.admin-input`
Text input field.

```
Default:  background #EDE9E4, border 1px solid transparent
Hover:    background #E4E0DB
Focus:    background #FFFFFF, border-color #8E2A23,
          box-shadow: 0 0 0 3px var(--shared-focus-ring)
Placeholder: var(--admin-text-faint)
Size:     text-sm, padding 9px 12px, rounded-lg
```

### `.admin-select`
Dropdown select — same styling as `.admin-input` plus custom caret SVG icon.

```
appearance: none
Custom SVG dropdown arrow at right 12px center
padding-right: 36px (space for caret)
```

---

## Tables

### `.admin-table`
Full-width table with wine red inverted header.

**Header row:**
```
background: var(--admin-table-header-bg)  → #8E2A23
color: var(--admin-table-header-text)     → #FFFFFF
font-size: 10px, font-weight: 500
text-transform: uppercase
letter-spacing: 0.05em
padding: px-4 py-2.5
```

**Body rows:**
```
Even rows: var(--admin-table-row-alt)     → #F7F5F2
Odd rows:  var(--admin-surface)           → #FFFFFF
Hover:     #EDE9E4
Cell border: 0.5px solid var(--admin-table-border)
Cell text: text-sm, var(--admin-text)
```

---

## Badges

Shared across both portals — no prefix.

```
.badge               → inline-flex, rounded-full, text-xs, font-medium, padding 2px 10px
.badge-success       → mint green fill, #0A5A50 text
.badge-info          → lavender fill, #5A2878 text
.badge-warning       → mauve fill, #702858 text
.badge-neutral       → sage fill, #20503A text
.badge-error         → pale rose fill, #802818 text
.badge-primary       → #F2E7E4 fill, #7B1F1A text
```

---

## Toasts

Shared notification toasts — no prefix.

### Structure
```html
<div class="toast toast-success">
  <span class="toast-icon">...</span>
  <div class="toast-body">
    <div class="toast-title">Title</div>
    <div class="toast-msg">Message</div>
  </div>
  <button class="toast-close">x</button>
</div>
```

### Container
```
.toast-container     → fixed bottom-right (24px), width 360px, z-50
```

### Variants
| Class | Background | Border |
|-------|-----------|--------|
| `.toast-success` | `#C8EEE2` | `rgba(10,90,80,0.25)` |
| `.toast-error` | `#F4D4CE` | `rgba(122,32,24,0.25)` |
| `.toast-warning` | `#FAECD0` | `rgba(122,78,8,0.25)` |
| `.toast-info` | `#E0DCF4` | `rgba(58,48,128,0.25)` |

---

## Alert Banners

Shared inline alert banners — prefixed `.shared-alert-*`.

| Class | Background | Border | Text |
|-------|-----------|--------|------|
| `.shared-alert-error` | `#FEF2F2` | `0.5px solid #FCA5A5` | `#B91C1C` |
| `.shared-alert-warning` | `rgba(212,160,192,.10)` | `0.5px solid #D4A0C0` | `#702858` |
| `.shared-alert-success` | `rgba(125,206,194,.10)` | `0.5px solid #7DCEC2` | `#0A5A50` |

All: `rounded-xl px-4 py-3 text-sm`.

---

## Shadows & Elevation

Defined in `@theme` — available as Tailwind utilities.

| Token | Value | Use |
|-------|-------|-----|
| `shadow-card` | `0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)` | Default card elevation |
| `shadow-elevated` | `0 4px 12px rgba(0,0,0,.08)` | Modals, popovers |
| `shadow-dropdown` | `0 8px 24px rgba(0,0,0,.10)` | Dropdown menus |

### Focus Ring
```
box-shadow: 0 0 0 3px var(--shared-focus-ring)  → rgba(142, 42, 35, 0.12)
border-color: #8E2A23
```

---

## File Map

```
app/globals.css                     ← All admin CSS vars + component classes
app/admin/layout.tsx                ← Admin shell + dark sidebar
app/admin/_components/TopBar.tsx    ← Shared top bar component
app/admin/page.tsx                  ← Dashboard (stat cards, tables)
app/admin/families/page.tsx         ← Reference for modals, inline editing
app/admin/payments/page.tsx         ← Reference for badges, status pills
app/admin/sessions/SessionsTable.tsx← Reference for tables, buttons
```

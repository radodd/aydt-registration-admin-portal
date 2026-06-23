import type { CSSProperties } from "react";

// The plum design tokens live in app/(user-facing)/portal.css, scoped to the
// user-facing layout — they are NOT in scope on /auth routes (there is no auth
// layout importing portal.css). Spread this object onto an /auth page's root
// wrapper `style` so the var() refs in that page resolve page-locally, without
// pulling portal.css's global body{} styles into the auth tree.
//
// Values mirror app/(user-facing)/portal.css :root. Keep in sync if those change.
export const authTokens = {
  "--plum": "#7A4A72",
  "--plum-700": "#5E3458",
  "--pub-page-bg": "#FDFBF9",
  "--pub-surface": "#FFFFFF",
  "--pub-border": "#E8DFD8",
  "--pub-border-subtle": "#F0EBE6",
  "--pub-text-primary": "#1A1714",
  "--pub-text-muted": "#786E65",
  "--pub-radius-md": "8px",
  "--pub-radius-xl": "16px",
  "--pub-shadow-elevated":
    "0 4px 16px rgba(26,23,20,0.10), 0 2px 4px rgba(26,23,20,0.05)",
  "--pub-font-primary": "var(--font-jakarta), system-ui, sans-serif",
  "--pub-font-secondary": "var(--font-outfit), system-ui, sans-serif",
  "--pub-badge-rose-bg": "#F5E4E4",
  "--pub-badge-rose-text": "#7A2018",
  "--pub-badge-sage-bg": "#D6EDD4",
  "--pub-badge-sage-text": "#1A5C16",
} as CSSProperties;

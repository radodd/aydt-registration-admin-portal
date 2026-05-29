import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "../shared/auth";
import { ensureSuperAdmin, buildSeed, SUPER_ADMIN, type PreviewSeed } from "./seed";

/**
 * Preview-flow UI harness.
 *
 * Drives the admin preview of several semesters (different registration modes)
 * through every step up to the "Review & Confirm" page — i.e. up to the point a
 * real parent would hand off to EPG — and records UI discrepancies. Cart +
 * registration state is seeded into the preview sessionStorage keys so each
 * step renders with data without hand-driving the per-mode add-to-cart UI.
 */

const SEMESTERS = [
  { id: "bddd7361-090c-42c4-90d7-c921b9c60c0c", label: "Adult Classes (drop-in / UNPRICED)" },
  { id: "3b3b3b3b-0001-4000-8000-000000000001", label: "Phase 3b Showcase (tiered + drop-in)" },
  { id: "00002026-0001-0000-0000-000000000001", label: "Washington Heights Spring 2026 (standard)" },
  { id: "2ee80bf6-a1b7-4fc3-8389-fece8414238a", label: "Summer 2026 (standard, 72 mtg)" },
  { id: "7e5b04cb-183e-411e-a1ee-f45a1b924aae", label: "Fall 2026 Draft (standard, DRAFT)" },
];

const STEPS = [
  { key: "1-landing", path: (id: string) => `/preview/semester/${id}` },
  { key: "2-cart", path: (id: string) => `/preview/semester/${id}/cart` },
  { key: "3-account", path: (id: string) => `/preview/semester/${id}/register` },
  { key: "4-participants", path: (id: string) => `/preview/semester/${id}/register/participants` },
  { key: "5-form", path: (id: string) => `/preview/semester/${id}/register/form` },
  { key: "6-payment", path: (id: string) => `/preview/semester/${id}/register/payment` },
];

const SHOTS_DIR = resolve(process.cwd(), "tests/reports/preview-shots");
const REPORT = resolve(process.cwd(), "tests/reports/preview-discrepancies.md");

interface Finding {
  semester: string;
  step: string;
  severity: "error" | "warn" | "note";
  message: string;
}
const findings: Finding[] = [];
const seeds = new Map<string, PreviewSeed | null>();

function record(semester: string, step: string, severity: Finding["severity"], message: string) {
  findings.push({ semester, step, severity, message });
}

/**
 * Detect a REAL Next.js error overlay or raw crash text. Note: the bare
 * <nextjs-portal> element hosts the dev indicator badge on EVERY page, so its
 * mere presence is not an error — only an actual error *dialog* counts.
 */
async function detectCrash(page: Page): Promise<string | null> {
  const dialog = await page
    .locator('[data-nextjs-dialog], [id^="nextjs__container_errors"], nextjs-portal [role="dialog"]')
    .count()
    .catch(() => 0);
  if (dialog > 0) {
    const txt =
      (await page.locator("nextjs-portal").first().innerText().catch(() => "")) || "error dialog present";
    return `Next.js error dialog: ${txt.slice(0, 200)}`;
  }
  const body = (await page.locator("body").innerText().catch(() => "")) || "";
  for (const marker of [
    "must be used inside",
    "Unhandled Runtime Error",
    "Application error: a client-side exception",
    "This page could not be found", // 404
  ]) {
    if (body.includes(marker)) return `Page text contains: "${marker}"`;
  }
  return null;
}

test.beforeAll(async () => {
  mkdirSync(SHOTS_DIR, { recursive: true });
  await ensureSuperAdmin();
  for (const s of SEMESTERS) {
    seeds.set(s.id, await buildSeed(s.id));
  }
});

test.afterAll(async () => {
  const bySev = (s: Finding["severity"]) => findings.filter((f) => f.severity === s);
  const lines: string[] = [];
  lines.push(`# Preview-flow harness — discrepancy report`);
  lines.push("");
  lines.push(`Semesters tested: ${SEMESTERS.length}. Steps per semester: ${STEPS.length} (up to Review & Confirm / pre-EPG).`);
  lines.push("");
  lines.push(`- 🔴 errors: ${bySev("error").length}`);
  lines.push(`- 🟡 warnings: ${bySev("warn").length}`);
  lines.push(`- ⚪ notes: ${bySev("note").length}`);
  lines.push("");
  for (const sev of ["error", "warn", "note"] as const) {
    const items = bySev(sev);
    if (items.length === 0) continue;
    const icon = sev === "error" ? "🔴" : sev === "warn" ? "🟡" : "⚪";
    lines.push(`## ${icon} ${sev.toUpperCase()}`);
    for (const f of items) lines.push(`- **${f.semester}** · _${f.step}_ — ${f.message}`);
    lines.push("");
  }
  writeFileSync(REPORT, lines.join("\n"), "utf8");
  // Also echo to stdout so it shows in the test run.
  // eslint-disable-next-line no-console
  console.log("\n" + lines.join("\n") + "\n");
});

for (const sem of SEMESTERS) {
  test(`preview flow — ${sem.label}`, async ({ page }) => {
    test.setTimeout(120_000); // 6 steps × (networkidle + settle)
    const seed = seeds.get(sem.id);
    await signIn(page, SUPER_ADMIN.email, SUPER_ADMIN.password);

    if (!seed) {
      record(sem.label, "setup", "warn", "No class meetings found — cannot seed cart; only landing tested.");
    } else {
      // Seed preview cart + registration sessionStorage before every navigation.
      await page.addInitScript(
        (s) => {
          try {
            sessionStorage.setItem(s.cartKey, s.cartValue);
            sessionStorage.setItem(s.regKey, s.regValue);
          } catch {}
        },
        seed,
      );
    }

    const shortId = sem.id.slice(0, 8);

    for (const step of STEPS) {
      await page.goto(step.path(sem.id), { waitUntil: "domcontentloaded" });
      // Let client providers + data fetches settle (networkidle handles heavy
      // semesters; the extra wait covers the loading-skeleton → content swap).
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(2500);

      // Auth sanity — we should never be bounced to login.
      if (/\/auth\/login/.test(page.url())) {
        record(sem.label, step.key, "error", "Redirected to /auth/login — super_admin gate rejected the session.");
        break;
      }

      await page.screenshot({ path: resolve(SHOTS_DIR, `${shortId}__${step.key}.png`), fullPage: true });

      const crash = await detectCrash(page);
      if (crash) {
        record(sem.label, step.key, "error", crash);
        continue;
      }

      const body = (await page.locator("body").innerText().catch(() => "")) || "";

      // Step-specific checks
      if (step.key === "2-cart") {
        if (body.includes("Your cart is empty")) {
          record(sem.label, step.key, "error", "Cart review shows EMPTY cart (seeded cart not read / lost).");
        } else if (seed && !body.includes(seed.className)) {
          record(sem.label, step.key, "warn", `Cart review does not show class name "${seed.className}".`);
        }
      }

      if (step.key === "3-account") {
        if (!body.includes("Enter your email address")) {
          record(sem.label, step.key, "warn", "Account step missing new-design heading 'Enter your email address'.");
        }
      }

      if (step.key === "4-participants") {
        if (seed && !body.includes(seed.className)) {
          record(sem.label, step.key, "warn", `Participants step does not show class name "${seed.className}".`);
        }
      }

      if (step.key === "6-payment") {
        if (!body.includes("Review")) {
          record(sem.label, step.key, "warn", "Payment step missing 'Review & Confirm' heading.");
        }
        // Discrepancy check: does the pre-EPG screen show WHAT is being registered?
        const showsClass = seed ? body.includes(seed.className) : false;
        const showsDancer = body.includes("Preview Dancer");
        if (!showsClass && !showsDancer) {
          record(
            sem.label,
            step.key,
            "warn",
            "Review & Confirm (pre-EPG) shows NO order summary in preview — no class/dancer data visible to the admin.",
          );
        }
      }
    }
  });
}

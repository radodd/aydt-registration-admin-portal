/**
 * EPG certification harness — shared infrastructure.
 *
 * Drives the FULL flow against the Elavon CERT (UAT) account:
 *   create order/session → redirect to HPP → fill card on Elavon's page →
 *   webhook fires → poll batch-status → snapshot DB → write JSON artifact.
 *
 * This file holds everything that is independent of how a batch is created
 * (preflight, HPP automation, polling, DB snapshot, capture). The batch-setup
 * step lives in setup.ts.
 *
 * Env (loaded from .env.local, mirroring tests/e2e/shared/db.ts):
 *   EPG_BASE_URL, EPG_MERCHANT_ALIAS, EPG_SECRET_KEY
 *   EPG_WEBHOOK_USERNAME, EPG_WEBHOOK_PASSWORD   (informational — set in portal)
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SITE_URL                                     (public https base for callbacks)
 *   PLAYWRIGHT_BASE_URL                           (defaults to SITE_URL/localhost)
 *
 * Gate: cert specs check EPG_CERT_RUN before doing anything (see specs). This
 * keeps them out of the normal `playwright test` / CI run.
 */

import { type Page, type Frame, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CertScenario } from "./scenarios";

config({ path: resolve(process.cwd(), ".env.local") });

/* -------------------------------------------------------------------------- */
/* Env + clients                                                               */
/* -------------------------------------------------------------------------- */

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[epg-cert] Missing required env var: ${name}`);
  return v;
}

/** Service-role Supabase client — bypasses RLS. Test-only. */
let _db: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_db) {
    _db = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _db;
}

export function epgBaseUrl(): string {
  return requireEnv("EPG_BASE_URL").replace(/\/$/, "");
}

/** Basic-auth header for the EPG API (merchantAlias:secretKey). */
export function epgHeaders(): Record<string, string> {
  const alias = requireEnv("EPG_MERCHANT_ALIAS");
  const key = requireEnv("EPG_SECRET_KEY");
  const token = Buffer.from(`${alias}:${key}`).toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json;charset=UTF-8",
    "Accept-Version": "1",
  };
}

/* -------------------------------------------------------------------------- */
/* Preflight                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Confirm the cert account is reachable and configured before running any
 * scenario. The webhook-subscription check is the big one: per project memory,
 * a disabled Converge notification subscription leaves batches stuck 'pending'
 * with no webhook ever arriving — and the harness would just hang. We can't
 * read the subscription state via API, so we surface a loud reminder and rely
 * on the per-scenario webhook timeout to fail fast.
 */
export async function preflight(): Promise<void> {
  // 1. Base URL reachable (GET /health needs no auth).
  const health = await fetch(`${epgBaseUrl()}/health`).catch((e) => {
    throw new Error(`[epg-cert] EPG /health unreachable at ${epgBaseUrl()}: ${e}`);
  });
  if (!health.ok) {
    throw new Error(`[epg-cert] EPG /health returned ${health.status}`);
  }

  // 2. Auth works (a filtered shopper list should 200 even if empty).
  const auth = await fetch(`${epgBaseUrl()}/shoppers?limit=1`, { headers: epgHeaders() });
  if (auth.status === 401 || auth.status === 403) {
    throw new Error(
      `[epg-cert] EPG auth failed (${auth.status}). Check EPG_MERCHANT_ALIAS / EPG_SECRET_KEY ` +
        `(must be the SECRET key, not a public pk_ key).`,
    );
  }

  // 3. Loud reminder — cannot be verified via API.
  console.warn(
    "[epg-cert] PREFLIGHT: confirm the Converge notification subscription is ENABLED " +
      "and your webhook URL is publicly reachable, or batches will hang at 'pending'. " +
      `SITE_URL=${process.env.SITE_URL ?? "(unset)"}`,
  );
}

/* -------------------------------------------------------------------------- */
/* HPP automation (Playwright drives Elavon's hosted page)                     */
/* -------------------------------------------------------------------------- */

/** Email used on the hosted page (the field is required). */
export const HPP_EMAIL = "cert@example.com";
/** Name-on-card used on the hosted page (required field). */
export const HPP_CARDHOLDER = "Cert Tester";

/**
 * Fill and submit the Elavon Hosted Payment Page for a CARD scenario.
 *
 * Selectors confirmed against uat.hpp.converge.eu.elavonaws.com via the
 * discovery spec (2026-05-21). The page is a MUI app (hashed sc-* and Mui*
 * classes are unstable — we key off stable `name`/`id` instead) and opens on a
 * payment-type chooser; the card form renders only after selecting the card
 * radio. Masked tel fields are typed (pressSequentially), not .fill()'d.
 *
 * NOTE: the hosted page collects NO billing address/ZIP, so AVS cannot be
 * driven here — scenario.billing is intentionally ignored. AVS must be tested
 * via stored-card charges (billTo on the Shopper). CVV is entered here.
 */
export async function fillHostedCardPage(page: Page, scenario: CertScenario): Promise<void> {
  // 0-1. Reveal the card form. Two layouts:
  //   - doCapture:true sales open on a payment-type chooser (card/ACH radios);
  //     selecting the card radio reveals the form.
  //   - doCapture:false (card tokenization) shows the card form directly.
  // Wait for whichever appears; click the card radio if the chooser is present.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const holder = page.locator("input[name='holderName']");
  const cardRadio = page.locator("input[name='paymentTypeSelector']").first();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await holder.isVisible().catch(() => false)) break;
    if (await cardRadio.count().catch(() => 0)) {
      await cardRadio.check({ force: true }).catch(() => undefined);
    }
    await page.waitForTimeout(1000);
  }

  // 2. Fill the name on card.
  await holder.waitFor({ state: "visible", timeout: 10_000 });
  await holder.fill(HPP_CARDHOLDER);

  // 3. Masked tel fields — type so the input masks format correctly.
  await typeMasked(page, "input[name='cardNumber']", scenario.pan);
  await typeMasked(page, "input[name='expiryDate']", futureExpiryDigits());
  await typeMasked(page, "input[name='securityCode']", scenario.cvv ?? defaultCvv(scenario));

  // 4. Email is required on the hosted page.
  const email = page.locator("input[name='shopperEmailAddress']");
  if (await email.count().catch(() => 0)) await email.fill(HPP_EMAIL);

  // 5. Submit.
  await page.locator("#qa_submit_payment").click();

  // 6. The processor enforces 3DS — complete the challenge so the gateway
  //    (cents) decides approve/decline, not the 3DS result.
  await complete3dsChallenge(page, { success: true });
}

/**
 * Complete the Elavon UAT 3DS challenge. After PAY the hosted page runs a 3DS
 * method/fingerprint step, then renders a challenge iframe at
 * uat.acs.fraud.eu.elavonaws.com/acs/challenge/* containing a simulator control
 * (`select#transStatus`: "Y" success / "N" not-auth, `input#challengeData`, and
 * a "Continue" link). We pick Success so authentication passes and the gateway
 * decides the outcome. Returns false if no challenge appears (frictionless).
 */
export async function complete3dsChallenge(page: Page, opts: { success?: boolean } = {}): Promise<boolean> {
  const success = opts.success ?? true;
  const deadline = Date.now() + 30_000;
  let acs: Frame | undefined;
  while (Date.now() < deadline) {
    acs = page.frames().find((f) => f.url().includes("/acs/challenge"));
    if (acs && (await acs.locator("#transStatus").count().catch(() => 0))) break;
    acs = undefined;
    await sleep(1500);
  }
  if (!acs) return false; // frictionless — no challenge rendered

  // The simulator defaults to "Success" — for an approval we just click
  // Continue (leaving challengeData/transStatus untouched). Only touch the
  // dropdown when explicitly simulating a 3DS failure.
  if (!success) {
    await acs.locator("#transStatus").selectOption("N").catch(() => undefined);
  }
  await acs.getByText("Continue", { exact: true }).click().catch(() => undefined);
  return true;
}

/** Four-digit expiry (MMYY), current year + 3. The mask inserts the slash. */
function futureExpiryDigits(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String((d.getFullYear() + 3) % 100).padStart(2, "0");
  return `${mm}${yy}`;
}

/** Brand-correct length default CVV when a scenario doesn't pin one. */
function defaultCvv(scenario: CertScenario): string {
  return scenario.brand === "amex" ? "1111" : "111";
}

/** Focus a masked input and type digit-by-digit so the mask formats it. */
async function typeMasked(page: Page, selector: string, value: string): Promise<void> {
  const loc = page.locator(selector).first();
  await loc.click();
  await loc.pressSequentially(value, { delay: 40 });
}

/* -------------------------------------------------------------------------- */
/* Polling                                                                     */
/* -------------------------------------------------------------------------- */

export type BatchStatus = "pending" | "confirmed" | "failed" | "cancelled" | "expired" | string;

/**
 * Poll GET /api/register/batch-status until it reaches a terminal state or the
 * timeout elapses. Returns the final status. Throws on timeout so a hung
 * webhook (e.g. disabled subscription) fails loudly rather than silently.
 */
export async function pollBatchStatus(
  baseUrl: string,
  batchId: string,
  opts: { expect?: BatchStatus; timeoutMs?: number; intervalMs?: number } = {},
): Promise<BatchStatus> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  let last: BatchStatus = "pending";

  while (Date.now() < deadline) {
    const res = await fetch(`${baseUrl}/api/register/batch-status?id=${encodeURIComponent(batchId)}`);
    if (res.ok) {
      const body = (await res.json()) as { status?: BatchStatus };
      last = body.status ?? last;
      if (opts.expect && last === opts.expect) return last;
      if (!opts.expect && last !== "pending") return last;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `[epg-cert] batch ${batchId} did not reach ${opts.expect ?? "a terminal state"} ` +
      `within ${timeoutMs}ms (last='${last}'). If still 'pending', check the Converge ` +
      `notification subscription and webhook reachability.`,
  );
}

/** Poll a payments-row column to a value (for void/refund, which don't move batch status). */
export async function pollPaymentState(
  batchId: string,
  expectState: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const { data } = await db().from("payments").select("state").eq("custom_reference", batchId).maybeSingle();
    last = (data?.state as string) ?? last;
    if (last === expectState) return last;
    await sleep(intervalMs);
  }
  throw new Error(`[epg-cert] payment for batch ${batchId} never reached '${expectState}' (last='${last}').`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll a doCapture:false session for its single-use hosted token (card or ACH),
 * which only populates AFTER 3DS completes. The API returns the token as a bare
 * string href (not the `{ href }` object the EpgPaymentSession type implies), so
 * we normalize both shapes.
 */
export async function waitForHostedToken(
  sessionHref: string,
  kind: "card" | "ach",
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const field = kind === "card" ? "hostedCard" : "hostedAchPayment";
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await fetchEpgResource<Record<string, unknown>>(sessionHref);
    const v = s[field] as { href?: string } | string | null | undefined;
    const href = typeof v === "string" ? v : v?.href;
    if (href) return href;
    await sleep(intervalMs);
  }
  throw new Error(`[epg-cert] no ${field} token on session ${sessionHref} within ${timeoutMs}ms (3DS not completed?)`);
}

/* -------------------------------------------------------------------------- */
/* DB snapshot                                                                 */
/* -------------------------------------------------------------------------- */

export interface DbSnapshot {
  batch: unknown;
  payments: unknown;
  installments: unknown;
  refunds: unknown;
  shopper: unknown;
}

/** Capture the DB state relevant to a batch after a scenario runs. */
export async function snapshotDb(batchId: string, userId?: string): Promise<DbSnapshot> {
  const supabase = db();
  const [batch, payments, installments, refunds, shopper] = await Promise.all([
    supabase.from("registration_orders").select("*").eq("id", batchId).maybeSingle(),
    supabase.from("payments").select("*").eq("custom_reference", batchId),
    supabase.from("order_payment_installments").select("*").eq("registration_batch_id", batchId),
    supabase.from("payment_refunds").select("*").eq("registration_batch_id", batchId),
    userId ? supabase.from("shoppers").select("*").eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    batch: batch.data,
    payments: payments.data,
    installments: installments.data,
    refunds: refunds.data,
    shopper: (shopper as { data: unknown }).data,
  };
}

/* -------------------------------------------------------------------------- */
/* JSON artifact capture                                                       */
/* -------------------------------------------------------------------------- */

export interface ScenarioArtifact {
  scenarioId: string;
  description: string;
  ranAt: string;
  batchId: string;
  /** What we expected vs what happened — filled by the spec. */
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
  /** Raw EPG transaction object (always GET it; never trust the webhook payload). */
  epgTransaction?: unknown;
  /** Raw webhook notification body, if captured. */
  webhookPayload?: unknown;
  dbState: DbSnapshot;
  passed: boolean;
}

// Resolved from the repo root (the documented cwd for running these specs).
const CAPTURE_DIR = resolve(process.cwd(), "tests/e2e/epg-cert/capture");

/** Write one timestamped JSON artifact per scenario into ./capture (gitignored). */
export function writeArtifact(artifact: ScenarioArtifact): string {
  mkdirSync(CAPTURE_DIR, { recursive: true });
  const stamp = artifact.ranAt.replace(/[:.]/g, "-");
  const file = resolve(CAPTURE_DIR, `${stamp}_${artifact.scenarioId}.json`);
  writeFileSync(file, JSON.stringify(artifact, null, 2), "utf8");
  return file;
}

/* -------------------------------------------------------------------------- */
/* EPG resource fetch (always GET the resource — never trust the webhook body) */
/* -------------------------------------------------------------------------- */

/**
 * Create a Shopper with a billing address. Uses `primaryAddress` — the field
 * the LIVE API accepts (confirmed: `billTo`/`billingAddress`/`address` are
 * rejected with jsonBindingFailure). NOTE: production's createEpgShopper in
 * utils/payment/epg.ts sends `billTo` and would be rejected — that's the item-2
 * AVS bug Justin flagged (primaryAddress); fix separately. This test-only
 * helper avoids the broken production path.
 */
export async function createCertShopper(params: {
  customReference: string;
  fullName?: string;
  email?: string;
  primaryAddress?: { street1: string; street2?: string; city: string; region: string; postalCode: string; countryCode?: string };
}): Promise<{ id: string; href: string }> {
  const res = await fetch(`${epgBaseUrl()}/shoppers`, {
    method: "POST",
    headers: epgHeaders(),
    body: JSON.stringify({
      customReference: params.customReference,
      fullName: params.fullName,
      email: params.email,
      ...(params.primaryAddress && {
        primaryAddress: {
          street1: params.primaryAddress.street1,
          street2: params.primaryAddress.street2 ?? "",
          city: params.primaryAddress.city,
          region: params.primaryAddress.region,
          postalCode: params.primaryAddress.postalCode,
          countryCode: params.primaryAddress.countryCode ?? "USA",
        },
      }),
    }),
  });
  if (!res.ok) throw new Error(`[epg-cert] POST /shoppers → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ id: string; href: string }>;
}

/**
 * Create a payment session with full control over doCreateTransaction (the
 * production createEpgPaymentSession hardcodes it true). For pure card
 * tokenization (stored card without an immediate charge), doCreateTransaction
 * must be false so the hosted-card token isn't consumed by an auth.
 */
export async function createCertSession(params: {
  orderHref: string;
  returnUrl: string;
  cancelUrl: string;
  customReference: string;
  doCapture?: boolean;
  doCreateTransaction?: boolean;
  doThreeDSecure?: boolean;
}): Promise<{ href: string; url: string; id: string }> {
  const res = await fetch(`${epgBaseUrl()}/payment-sessions`, {
    method: "POST",
    headers: epgHeaders(),
    body: JSON.stringify({
      order: params.orderHref,
      hppType: "fullPageRedirect",
      returnUrl: params.returnUrl,
      cancelUrl: params.cancelUrl,
      doCreateTransaction: params.doCreateTransaction ?? true,
      doCapture: params.doCapture ?? true,
      doThreeDSecure: params.doThreeDSecure ?? true,
      customReference: params.customReference,
    }),
  });
  if (!res.ok) throw new Error(`[epg-cert] POST /payment-sessions → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ href: string; url: string; id: string }>;
}

export async function fetchEpgResource<T = unknown>(href: string): Promise<T> {
  const res = await fetch(href, { headers: epgHeaders() });
  if (!res.ok) throw new Error(`[epg-cert] GET ${href} → ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * After the hosted page is submitted, the resulting transaction shows up in the
 * session's `previousTransactions[]` (NOT `session.transaction`, which stays
 * null for HPP sales). Poll the session until a transaction href appears.
 * Independent of the returnUrl redirect (which ngrok-free's interstitial blocks).
 */
export async function waitForSessionTransaction(
  sessionHref: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 75_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await fetchEpgResource<{
      previousTransactions?: string[];
      transaction?: { href?: string } | string | null;
    }>(sessionHref);
    const prev = s.previousTransactions;
    if (Array.isArray(prev) && prev.length) return prev[prev.length - 1];
    const t = s.transaction;
    const href = typeof t === "string" ? t : t?.href;
    if (href) return href;
    await sleep(intervalMs);
  }
  throw new Error(`[epg-cert] no transaction appeared on session ${sessionHref} within ${timeoutMs}ms`);
}

/* -------------------------------------------------------------------------- */
/* Assertions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Assert a transaction's authorization result. EPG returns HTTP 201 even on
 * decline, so we assert on the `state`/`isAuthorized` fields, never status.
 */
export function assertAuthResult(txn: { state?: string; isAuthorized?: boolean }, expected: "approved" | "declined"): void {
  const authorized = txn.isAuthorized === true || ["authorized", "captured", "settled"].includes(txn.state ?? "");
  if (expected === "approved") {
    expect(authorized, `expected approval, got state=${txn.state} isAuthorized=${txn.isAuthorized}`).toBe(true);
  } else {
    expect(authorized, `expected decline, got state=${txn.state} isAuthorized=${txn.isAuthorized}`).toBe(false);
  }
}

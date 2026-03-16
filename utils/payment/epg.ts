/**
 * EPG REST API client — server-side only.
 *
 * All functions use HTTP Basic auth with the secret key. Never import this
 * file from a client component or an edge runtime route — it reads server-only
 * environment variables (EPG_SECRET_KEY, EPG_MERCHANT_ALIAS).
 *
 * Auth format per spec: base64(merchantAlias:secretKey)
 * Base URL: EPG_BASE_URL env var (sandbox or production)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EpgOrder {
  id: string;
  href: string;
  total: { amount: string; currencyCode: string };
  customReference: string | null;
}

export interface EpgPaymentSession {
  id: string;
  href: string;
  /** The URL to redirect the user to for the hosted payment page. */
  url: string;
  transaction: string | null; // Resource URL of the created transaction, if any
  state?: string;
  /** Populated when doCapture: false — one-time token used to create a Stored Card. */
  hostedCard: { href: string } | null;
  /** Populated when doCapture: false on an ACH session — one-time token for Stored ACH. */
  hostedAchPayment: { href: string } | null;
}

export interface EpgTransaction {
  id: string;
  href: string;
  type: string; // "sale" | "void" | "refund"
  isAuthorized: boolean;
  state: string; // TransactionState enum from spec
  total: { amount: string; currencyCode: string };
  customReference: string | null;
  authorizationCode: string | null;
  card: {
    maskedNumber: string | null;
    last4: string | null;
    scheme: string | null;
  } | null;
}

export interface EpgFailure {
  code: string;
  description: string;
  field: string | null;
}

/** Ref: docs/elavon/api_shoppers.md */
export interface EpgShopper {
  id: string;
  href: string;
  fullName: string | null;
  email: string | null;
  customReference: string | null;
  createdAt: string;
  modifiedAt: string | null;
}

/** Ref: docs/elavon/api_stored_cards.md */
export interface EpgStoredCard {
  id: string;
  href: string;
  /** Href of the parent Shopper resource. */
  shopper: string;
  card: {
    maskedNumber: string | null;
    last4: string | null;
    bin: string | null;
    scheme: string | null;
    brand: string | null;
    fundingSource: string | null;
    expirationMonth: number | null;
    expirationYear: number | null;
  } | null;
  credentialOnFileType: string | null;
  customReference: string | null;
  createdAt: string;
  modifiedAt: string | null;
}

/** Ref: docs/elavon/api_stored_ach.md */
export interface EpgStoredAchPayment {
  id: string;
  href: string;
  /** Href of the parent Shopper resource. */
  shopper: string;
  last4: string | null;
  achAccountType: string | null;
  accountName: string | null;
  achFingerprint: string | null;
  customReference: string | null;
  createdAt: string;
  modifiedAt: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const url = process.env.EPG_BASE_URL;
  if (!url) throw new Error("EPG_BASE_URL is not set");
  return url.replace(/\/$/, ""); // strip trailing slash
}

function buildAuthHeader(): string {
  const alias = process.env.EPG_MERCHANT_ALIAS;
  const key = process.env.EPG_SECRET_KEY;
  if (!alias) throw new Error("EPG_MERCHANT_ALIAS is not set");
  if (!key) throw new Error("EPG_SECRET_KEY is not set");
  return "Basic " + Buffer.from(`${alias}:${key}`).toString("base64");
}

function defaultHeaders(): Record<string, string> {
  return {
    Authorization: buildAuthHeader(),
    "Content-Type": "application/json",
    Accept: "application/json;charset=UTF-8",
    "Accept-Version": "1",
  };
}

/**
 * Throws a descriptive error on non-2xx responses, including EPG failure codes.
 */
async function assertOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;
  let body: { failures?: EpgFailure[] } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON body (5xx health issues)
  }
  const failures = body.failures ?? [];
  const detail =
    failures.length > 0
      ? failures.map((f) => `[${f.code}] ${f.description}`).join("; ")
      : `HTTP ${res.status}`;
  throw new Error(`EPG ${context} failed: ${detail}`);
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * POST /orders
 * Creates an EPG Order resource representing the amount to charge.
 * The customReference (= batchId) is stored on the Order for reconciliation.
 */
export async function createEpgOrder(params: {
  amountDollars: number;
  currencyCode: string;
  description: string;
  /** batchId — stored as customReference and orderReference for dashboard visibility */
  customReference: string;
}): Promise<EpgOrder> {
  const res = await fetch(`${getBaseUrl()}/orders`, {
    method: "POST",
    headers: defaultHeaders(),
    body: JSON.stringify({
      total: {
        amount: params.amountDollars.toFixed(2),
        currencyCode: params.currencyCode,
      },
      description: params.description,
      customReference: params.customReference,
      orderReference: params.customReference,
    }),
  });
  await assertOk(res, "POST /orders");
  return res.json() as Promise<EpgOrder>;
}

/**
 * POST /payment-sessions
 * Creates a Hosted Payment Page session linked to the given order.
 * Returns a session with a `url` the user should be redirected to.
 *
 * doCreateTransaction: true — EPG handles the full sale automatically.
 * doThreeDSecure: true — enables 3DS for liability shift (requires processor account config).
 */
export async function createEpgPaymentSession(params: {
  /** Full HREF of the Order resource (e.g. https://uat.../orders/{id}) */
  orderHref: string;
  returnUrl: string;
  cancelUrl: string;
  /** batchId — stored on the session for cross-reference */
  customReference: string;
  doThreeDSecure?: boolean;
  /**
   * Set false for installment plans — EPG will return a hostedCard token
   * in the session result that can be used to create a Stored Card.
   * Ref: docs/elavon/api_stored_cards.md § "How to Get a Hosted Card Token"
   */
  doCapture?: boolean;
}): Promise<EpgPaymentSession> {
  const res = await fetch(`${getBaseUrl()}/payment-sessions`, {
    method: "POST",
    headers: defaultHeaders(),
    body: JSON.stringify({
      order: params.orderHref,
      hppType: "fullPageRedirect",
      returnUrl: params.returnUrl,
      cancelUrl: params.cancelUrl,
      doCreateTransaction: true,
      doCapture: params.doCapture ?? true,
      doThreeDSecure: params.doThreeDSecure ?? true,
      customReference: params.customReference,
    }),
  });
  await assertOk(res, "POST /payment-sessions");
  return res.json() as Promise<EpgPaymentSession>;
}

/**
 * GET {paymentSessionHref}
 * Fetches the current state of a payment session.
 * Used by createEPGPaymentSession server action for idempotency — if a session
 * already exists and is still valid, we return its URL rather than creating a new one.
 */
export async function fetchEpgPaymentSession(
  sessionHref: string
): Promise<EpgPaymentSession> {
  const res = await fetch(sessionHref, { headers: defaultHeaders() });
  await assertOk(res, `GET payment-session`);
  return res.json() as Promise<EpgPaymentSession>;
}

/**
 * GET {transactionHref}
 * Fetches the full transaction object from EPG.
 * Called by the webhook handler after receiving a notification — we NEVER
 * trust the notification payload alone; we always fetch the resource directly.
 */
export async function fetchEpgTransaction(
  transactionHref: string
): Promise<EpgTransaction> {
  const res = await fetch(transactionHref, { headers: defaultHeaders() });
  await assertOk(res, `GET transaction`);
  return res.json() as Promise<EpgTransaction>;
}

/**
 * POST /shoppers
 * Creates an EPG Shopper resource representing a customer.
 * customReference should be the Supabase user_id for reconciliation.
 * Ref: docs/elavon/api_shoppers.md
 */
export async function createEpgShopper(params: {
  /** Supabase user_id */
  customReference: string;
  fullName?: string;
  email?: string;
}): Promise<EpgShopper> {
  const res = await fetch(`${getBaseUrl()}/shoppers`, {
    method: "POST",
    headers: defaultHeaders(),
    body: JSON.stringify({
      customReference: params.customReference,
      fullName: params.fullName,
      email: params.email,
    }),
  });
  await assertOk(res, "POST /shoppers");
  return res.json() as Promise<EpgShopper>;
}

/**
 * GET /shoppers?filter=customReference_eq_{customReference}
 * Finds an existing Shopper by our customReference (= Supabase user_id).
 * Returns null if not found.
 * Ref: docs/elavon/api_shoppers.md
 *
 * NOTE: EPG list response envelope shape needs sandbox verification.
 * Expected: { list: EpgShopper[] } — adjust if actual shape differs.
 */
export async function fetchEpgShopperByReference(
  customReference: string
): Promise<EpgShopper | null> {
  const url = `${getBaseUrl()}/shoppers?filter=customReference_eq_${encodeURIComponent(customReference)}`;
  const res = await fetch(url, { headers: defaultHeaders() });
  await assertOk(res, "GET /shoppers (filter)");
  const body = (await res.json()) as { list?: EpgShopper[] } | EpgShopper[];
  const list = Array.isArray(body) ? body : (body as { list?: EpgShopper[] }).list ?? [];
  return list[0] ?? null;
}

/**
 * POST /stored-cards
 * Creates a reusable Stored Card from a one-time hostedCard token.
 * hostedCardHref comes from fetchEpgPaymentSession().hostedCard.href
 * after a payment session with doCapture: false.
 * Ref: docs/elavon/api_stored_cards.md
 */
export async function createEpgStoredCard(params: {
  shopperHref: string;
  hostedCardHref: string;
  /** registration_batch_id */
  customReference?: string;
}): Promise<EpgStoredCard> {
  const res = await fetch(`${getBaseUrl()}/stored-cards`, {
    method: "POST",
    headers: defaultHeaders(),
    body: JSON.stringify({
      shopper: params.shopperHref,
      hostedCard: params.hostedCardHref,
      shopperInteraction: "ecommerce",
      credentialOnFileType: "recurring",
      customReference: params.customReference,
    }),
  });
  await assertOk(res, "POST /stored-cards");
  return res.json() as Promise<EpgStoredCard>;
}

/**
 * POST /stored-ach-payments
 * Creates a reusable Stored ACH from a one-time hostedAchPayment token.
 * hostedAchPaymentHref comes from fetchEpgPaymentSession().hostedAchPayment.href
 * after a payment session with doCapture: false.
 * Ref: docs/elavon/api_stored_ach.md
 */
export async function createEpgStoredAchPayment(params: {
  shopperHref: string;
  hostedAchPaymentHref: string;
  /** registration_batch_id */
  customReference?: string;
}): Promise<EpgStoredAchPayment> {
  const res = await fetch(`${getBaseUrl()}/stored-ach-payments`, {
    method: "POST",
    headers: defaultHeaders(),
    body: JSON.stringify({
      shopper: params.shopperHref,
      hostedAchPayment: params.hostedAchPaymentHref,
      customReference: params.customReference,
    }),
  });
  await assertOk(res, "POST /stored-ach-payments");
  return res.json() as Promise<EpgStoredAchPayment>;
}

/**
 * POST /transactions
 * Server-to-server charge against a stored card or stored ACH payment.
 * Used to capture installment 1 after card storage and for all future
 * installment charges via the recurring cron job.
 * Ref: docs/elavon/api_transactions.md
 *
 * IMPORTANT: EPG returns HTTP 201 even for declined transactions.
 * Callers MUST check result.isAuthorized — do not rely on HTTP status alone.
 */
export async function createEpgTransaction(params: {
  storedCardHref?: string;
  storedAchPaymentHref?: string;
  shopperHref?: string;
  amountDollars: number;
  currencyCode: string;
  /** Use installment row id for idempotency on recurring charges */
  customReference: string;
  description?: string;
  doCapture?: boolean;
}): Promise<EpgTransaction> {
  if (!params.storedCardHref && !params.storedAchPaymentHref) {
    throw new Error("createEpgTransaction: must provide storedCardHref or storedAchPaymentHref");
  }
  if (params.storedCardHref && params.storedAchPaymentHref) {
    throw new Error("createEpgTransaction: provide storedCardHref or storedAchPaymentHref, not both");
  }
  const res = await fetch(`${getBaseUrl()}/transactions`, {
    method: "POST",
    headers: defaultHeaders(),
    body: JSON.stringify({
      ...(params.storedCardHref ? { storedCard: params.storedCardHref } : {}),
      ...(params.storedAchPaymentHref ? { storedAchPayment: params.storedAchPaymentHref } : {}),
      ...(params.shopperHref ? { shopper: params.shopperHref } : {}),
      total: {
        amount: params.amountDollars.toFixed(2),
        currencyCode: params.currencyCode,
      },
      customReference: params.customReference,
      description: params.description,
      doCapture: params.doCapture ?? true,
    }),
  });
  await assertOk(res, "POST /transactions");
  return res.json() as Promise<EpgTransaction>;
}

/**
 * Maps an EPG EventType string to our internal payment state.
 * Returns null for event types we don't track (refund events, etc.)
 */
export function epgEventTypeToPaymentState(
  eventType: string
): string | null {
  const map: Record<string, string> = {
    saleAuthorized: "authorized",
    saleCaptured: "captured",
    saleSettled: "settled",
    saleDeclined: "declined",
    saleHeldForReview: "held_for_review",
    voidAuthorized: "voided",
    refundAuthorized: "refunded",
  };
  return map[eventType] ?? null;
}

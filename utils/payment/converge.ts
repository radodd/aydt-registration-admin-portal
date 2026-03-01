/**
 * Converge (Elavon) Hosted Payment Page (HPP) client.
 *
 * Credentials required (set in environment variables):
 *   CONVERGE_MERCHANT_ID   — ssl_merchant_id
 *   CONVERGE_USER_ID       — ssl_user_id
 *   CONVERGE_PIN           — ssl_pin
 *   CONVERGE_API_URL       — defaults to demo endpoint; set to production URL for live payments
 *
 * Demo endpoint : https://api.convergepay.com/VirtualMerchantDemo/process.do
 * Prod endpoint : https://api.convergepay.com/VirtualMerchant/process.do
 *
 * HPP redirect  : https://api.convergepay.com/hosted-payments?ssl_txn_auth_token=TOKEN
 */

const CONVERGE_API_URL =
  process.env.CONVERGE_API_URL ??
  "https://api.convergepay.com/VirtualMerchantDemo/process.do";

const CONVERGE_HPP_BASE =
  "https://api.convergepay.com/hosted-payments";

export interface ConvergeSessionResult {
  /** The HPP auth token returned by Converge. */
  authToken: string;
  /** Full URL to redirect the user to for payment. */
  hostedPaymentUrl: string;
}

/**
 * Creates a Converge Hosted Payment Page session for a given amount.
 *
 * The browser should redirect to `hostedPaymentUrl` after calling this.
 * Converge will POST the result to `resultCallbackUrl` (server-to-server)
 * and redirect the user to `successRedirectUrl` or `cancelRedirectUrl`.
 */
export async function createConvergeSession(params: {
  /** Amount in dollars, e.g. 529.00 */
  amountDollars: number;
  /** Our batch UUID — stored as ssl_invoice_number and returned on webhook. */
  orderId: string;
  /** Short description shown on the Converge HPP. */
  description: string;
  /** Server-to-server callback URL where Converge POSTs the transaction result. */
  resultCallbackUrl: string;
  /** URL to redirect user after successful payment. */
  successRedirectUrl: string;
  /** URL to redirect user on declined / cancelled payment. */
  cancelRedirectUrl: string;
}): Promise<ConvergeSessionResult> {
  const body = new URLSearchParams({
    ssl_merchant_id: process.env.CONVERGE_MERCHANT_ID!,
    ssl_user_id: process.env.CONVERGE_USER_ID!,
    ssl_pin: process.env.CONVERGE_PIN!,
    ssl_transaction_type: "ccsale",
    ssl_amount: params.amountDollars.toFixed(2),
    ssl_description: params.description,
    ssl_invoice_number: params.orderId,
    // ssl_show_form=false → Converge returns a token rather than rendering the form
    ssl_show_form: "false",
    ssl_result_callback: params.resultCallbackUrl,
    ssl_next_url: params.successRedirectUrl,
    ssl_error_url: params.cancelRedirectUrl,
  });

  const response = await fetch(CONVERGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Converge API error: HTTP ${response.status}`);
  }

  // Converge responds in "key=value&key=value" URL-encoded format (not JSON)
  const text = await response.text();
  const fields = parseConvergeResponse(text);

  const authToken = fields["ssl_txn_auth_token"];
  if (!authToken) {
    const errMsg =
      fields["ssl_result_message"] ??
      fields["errorMessage"] ??
      "Failed to create payment session";
    throw new Error(`Converge HPP session error: ${errMsg}`);
  }

  const hostedPaymentUrl = `${CONVERGE_HPP_BASE}?ssl_txn_auth_token=${encodeURIComponent(authToken)}`;

  return { authToken, hostedPaymentUrl };
}

/**
 * Parses Converge's "key=value&key=value" response format.
 * Note: some fields may be XML-wrapped in certain API versions; this handles the
 * URL-encoded variant used by the VirtualMerchant endpoint.
 */
function parseConvergeResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of text.split("&")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = decodeURIComponent(pair.slice(0, eqIdx).trim());
    const val = decodeURIComponent(pair.slice(eqIdx + 1).trim());
    result[key] = val;
  }
  return result;
}

/**
 * Parses the form POST body sent by Converge to the result callback URL.
 * Returns a structured result for the webhook handler.
 */
export interface ConvergeWebhookPayload {
  approved: boolean;
  result: string;          // '0' = approved, '1' = declined
  txnId: string;           // ssl_txn_id
  invoiceNumber: string;   // ssl_invoice_number (= our batchId)
  amount: string;          // ssl_amount
  approvalCode: string;    // ssl_approval_code
  cardType: string;        // ssl_card_short_description
  last4: string;           // ssl_card_number (last 4 masked)
  raw: Record<string, string>;
}

export function parseConvergeWebhook(
  formData: URLSearchParams,
): ConvergeWebhookPayload {
  const raw: Record<string, string> = {};
  formData.forEach((value, key) => {
    raw[key] = value;
  });

  return {
    approved: raw["ssl_result"] === "0",
    result: raw["ssl_result"] ?? "",
    txnId: raw["ssl_txn_id"] ?? "",
    invoiceNumber: raw["ssl_invoice_number"] ?? "",
    amount: raw["ssl_amount"] ?? "",
    approvalCode: raw["ssl_approval_code"] ?? "",
    cardType: raw["ssl_card_short_description"] ?? "",
    last4: raw["ssl_card_number"] ?? "",
    raw,
  };
}

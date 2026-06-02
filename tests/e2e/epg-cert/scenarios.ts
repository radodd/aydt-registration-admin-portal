/**
 * EPG certification — scenario catalog.
 *
 * Source of truth for the values the harness fires against the Elavon CERT
 * (UAT) account. Values are drawn from two places:
 *
 *   - PANs: docs/elavon/test_cards.md (approval cards per brand).
 *   - Auth / AVS / CVV response controls: "ELAVON STP Test Host Pre-Programmed
 *     Responses" (Rev 6/4/2025), pages 4-9 (one page per brand).
 *
 * Three INDEPENDENT dials control a single transaction's outcome:
 *   1. Auth result   ← the CENTS of the amount (e.g. X.51 → NSF decline).
 *   2. AVS result    ← the FIRST CHARACTER of the billing postal code.
 *   3. CVV result    ← the CVV value entered.
 * They can be combined freely on one charge.
 *
 * IMPORTANT: every table below is BRAND-SPECIFIC. The same cents/ZIP/CVV maps
 * to different results on Visa vs MC vs Amex vs Discover. Do not collapse them.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "discover";

export const CARD_BRANDS: CardBrand[] = ["visa", "mastercard", "amex", "discover"];

/** Primary approval PAN per brand. Source: docs/elavon/test_cards.md. */
export const APPROVAL_CARDS: Record<CardBrand, string> = {
  visa: "4000000000000002",
  mastercard: "5121212121212124",
  amex: "370000000000002",
  discover: "6011000000000004",
};

/** Standard approval cents suffix. */
export const APPROVAL_SUFFIX = ".00";

/* -------------------------------------------------------------------------- */
/* 1. AUTH RESULT — cents suffix → meaning, per brand.                         */
/*    Covers Justin's matrix list (.51/.54/.55/.59/.78/.91/.96).               */
/*    Source: STP Test Host doc pages 4 (Visa), 5 (MC), 6 (Amex), 7 (Disc).    */
/* -------------------------------------------------------------------------- */

export const DECLINE_CODES: Record<CardBrand, Record<string, string>> = {
  visa: {
    ".51": "DECLINED: NSF",
    ".54": "EXPIRED CARD",
    ".55": "INCORRECT PIN",
    ".59": "SUSPECTED FRAUD",
    ".78": "INVALID CARD",
    ".91": "PLEASE RETRY 5305",
    ".96": "SYSTEM ERROR 96",
  },
  mastercard: {
    ".51": "DECLINED: NSF (advice M02)",
    ".54": "EXPIRED CARD (advice M03)",
    ".55": "INCORRECT PIN",
    ".59": "DECLINED",
    ".78": "INVALID CARD",
    ".91": "ISSUER UNAVAIL",
    ".96": "SYSTEM ERROR 96",
  },
  amex: {
    ".51": "DECLINED",
    ".54": "EXPIRED CARD",
    ".55": "INCORRECT PIN",
    ".59": "DECLINED",
    ".78": "INVALID CARD",
    ".91": "ISSUER UNAVAIL",
    ".96": "NETWORK ERROR 70",
  },
  discover: {
    ".51": "DECLINED",
    ".54": "EXPIRED CARD",
    ".55": "INCORRECT PIN",
    ".59": "SUSPECTED FRAUD",
    ".78": "INVALID CARD",
    ".91": "CALL AUTH CENTER",
    ".96": "SYSTEM ERROR 96",
  },
};

/** The cents codes from Justin's matrix, in order. */
export const JUSTIN_DECLINE_SUFFIXES = [".51", ".54", ".55", ".59", ".78", ".91", ".96"] as const;

/* -------------------------------------------------------------------------- */
/* 2. AVS RESULT — billing postal code → AVS response, per brand.              */
/*    Controlled by the FIRST CHARACTER of the postal code.                    */
/*                                                                             */
/*    A postal code starting with the desired AVS letter (Y/Z/A/N) yields that */
/*    AVS response on ALL four brands (letter rows on pages 4-7). Where a clean */
/*    numeric ZIP also yields the code on a brand, we prefer it (more          */
/*    realistic input for the HPP). Doc note: lowercase postal codes may shift */
/*    the AVS result — always use UPPERCASE.                                   */
/*                                                                             */
/*    Codes per Justin: Y (full match), Z (zip-only), A (address-only),        */
/*    N (no match). "Address Entry expected" codes also need a street1.        */
/* -------------------------------------------------------------------------- */

export type AvsCode = "Y" | "Z" | "A" | "N";

export const JUSTIN_AVS_CODES: AvsCode[] = ["Y", "Z", "A", "N"];

/** Street address used when the AVS control "expects address entry". */
export const AVS_STREET = "1 Test Street";

/**
 * Postal code per (brand, target AVS code).
 * Visa/Amex: numeric leading char 2→Y, 3→Z, 6→A, 4→N (pages 4 & 6).
 * MC/Discover: no numeric yields Y, so the letter-leading "Y…" form is used
 *   (pages 5 & 7 letter rows). Z/A/N remain numeric 3/6/4 on all brands.
 * If the hosted page rejects a letter-leading postal, AVS=Y can instead be
 * validated on Visa/Amex (where "20001" works).
 */
export const AVS_POSTAL: Record<CardBrand, Record<AvsCode, string>> = {
  visa: { Y: "20001", Z: "30001", A: "60001", N: "40001" },
  amex: { Y: "20001", Z: "30001", A: "60001", N: "40001" },
  mastercard: { Y: "Y0001", Z: "30001", A: "60001", N: "40001" },
  discover: { Y: "Y0001", Z: "30001", A: "60001", N: "40001" },
};

/* -------------------------------------------------------------------------- */
/* 3. CVV RESULT — CVV value → response, per brand.                            */
/*    Controlled by the CVV value's last digit (M=match, N=no-match).          */
/*    Visa/MC/Discover CVV2/CVC2/CID = 3 digits; Amex CID = 4 digits.          */
/*    Last digit 1 → Match; last digit 2 → No-match (pages 4-7).               */
/*    Also: leading zeros / spaces force No-match — avoided here.              */
/* -------------------------------------------------------------------------- */

export interface CvvPair {
  match: string;
  noMatch: string;
}

export const CVV_VALUES: Record<CardBrand, CvvPair> = {
  visa: { match: "111", noMatch: "112" },
  mastercard: { match: "111", noMatch: "112" },
  discover: { match: "111", noMatch: "112" },
  amex: { match: "1111", noMatch: "1112" }, // CID is 4 digits
};

/* -------------------------------------------------------------------------- */
/* 4. TIMEOUT — partial-write / async-failure scenario.                        */
/*    $22.22 (and $2,222.xx): the host PROCESSES the txn and generates a       */
/*    response, then BLOCKS the response from returning to the merchant — i.e. */
/*    Elavon authorizes but our webhook/return never sees it. This is the      */
/*    exact partial-write case item 5 validates.                               */
/*                                                                             */
/*    ✅ EPG APPLICABILITY CONFIRMED (Justin Huffines, 2026-05-30): the         */
/*    dollar-amount timeout controls DO apply to EPG / Converge (not only the  */
/*    certgate.viaconex.com gateway). Justin received no response for a $22.22  */
/*    transaction sent through his EPG test instance. The scenario is now      */
/*    live (`gatewayConfirmed: true`) and exercised by timeout.cert.spec.ts.   */
/* -------------------------------------------------------------------------- */

export const TIMEOUT = {
  /** Whole-dollar trigger; cents still define approve/decline if it reaches the host. */
  amountDollars: 22.22,
  /** Confirmed by Justin (2026-05-30) that EPG honors the timeout control. */
  gatewayConfirmed: true,
  note:
    "STP doc page 3: $22.22 = response blocked after processing. EPG/Converge " +
    "applicability CONFIRMED by Justin 2026-05-30 (no response on his EPG instance).",
} as const;

/* -------------------------------------------------------------------------- */
/* Scenario shape consumed by the spec files.                                  */
/* -------------------------------------------------------------------------- */

export type ScenarioKind = "approval" | "decline" | "avs" | "cvv" | "timeout";
export type ExpectedAuth = "approved" | "declined" | "blocked";

export interface CertScenario {
  /** Stable id used for the JSON artifact filename. */
  id: string;
  description: string;
  kind: ScenarioKind;
  brand: CardBrand;
  pan: string;
  /** Cents suffix appended to the base amount (drives the auth result). */
  centsSuffix: string;
  expectedAuth: ExpectedAuth;
  /** Billing postal/street to drive AVS (omit = use the test user's address). */
  billing?: { street1: string; postalCode: string };
  expectedAvs?: AvsCode;
  /** CVV value to drive the CVV result. */
  cvv?: string;
  expectedCvv?: "match" | "no-match";
  /**
   * True when this scenario is safe to run now. The only scenario gated off is
   * the timeout, pending Justin's gateway confirmation.
   */
  ready: boolean;
}

/** One approval per brand (clean .00, no AVS/CVV dial). */
export function buildApprovalScenarios(): CertScenario[] {
  return CARD_BRANDS.map((brand) => ({
    id: `approve-${brand}`,
    description: `${brand} approval`,
    kind: "approval",
    brand,
    pan: APPROVAL_CARDS[brand],
    centsSuffix: APPROVAL_SUFFIX,
    expectedAuth: "approved",
    ready: true,
  }));
}

/** Every Justin decline code, per brand. */
export function buildDeclineMatrix(): CertScenario[] {
  const out: CertScenario[] = [];
  for (const brand of CARD_BRANDS) {
    for (const suffix of JUSTIN_DECLINE_SUFFIXES) {
      out.push({
        id: `decline-${brand}${suffix}`,
        description: `${brand} ${suffix} — ${DECLINE_CODES[brand][suffix]}`,
        kind: "decline",
        brand,
        pan: APPROVAL_CARDS[brand],
        centsSuffix: suffix,
        expectedAuth: "declined",
        ready: true,
      });
    }
  }
  return out;
}

/** AVS Y/Z/A/N per brand, on an approved charge. */
export function buildAvsMatrix(): CertScenario[] {
  const out: CertScenario[] = [];
  for (const brand of CARD_BRANDS) {
    for (const code of JUSTIN_AVS_CODES) {
      out.push({
        id: `avs-${brand}-${code}`,
        description: `${brand} AVS=${code}`,
        kind: "avs",
        brand,
        pan: APPROVAL_CARDS[brand],
        centsSuffix: APPROVAL_SUFFIX,
        expectedAuth: "approved",
        billing: { street1: AVS_STREET, postalCode: AVS_POSTAL[brand][code] },
        expectedAvs: code,
        ready: true,
      });
    }
  }
  return out;
}

/** CVV match + no-match per brand, on an approved charge. */
export function buildCvvMatrix(): CertScenario[] {
  const out: CertScenario[] = [];
  for (const brand of CARD_BRANDS) {
    out.push(
      {
        id: `cvv-${brand}-match`,
        description: `${brand} CVV match`,
        kind: "cvv",
        brand,
        pan: APPROVAL_CARDS[brand],
        centsSuffix: APPROVAL_SUFFIX,
        expectedAuth: "approved",
        cvv: CVV_VALUES[brand].match,
        expectedCvv: "match",
        ready: true,
      },
      {
        id: `cvv-${brand}-no-match`,
        description: `${brand} CVV no-match`,
        kind: "cvv",
        brand,
        pan: APPROVAL_CARDS[brand],
        centsSuffix: APPROVAL_SUFFIX,
        // No-match typically still authorizes; assert the CVV flag, not a decline.
        expectedAuth: "approved",
        cvv: CVV_VALUES[brand].noMatch,
        expectedCvv: "no-match",
        ready: true,
      },
    );
  }
  return out;
}

/** The single timeout scenario — gated until Justin confirms EPG applicability. */
export function buildTimeoutScenario(): CertScenario {
  return {
    id: "timeout-visa",
    description: `visa timeout / partial-write — ${TIMEOUT.note}`,
    kind: "timeout",
    brand: "visa",
    pan: APPROVAL_CARDS.visa,
    centsSuffix: APPROVAL_SUFFIX,
    expectedAuth: "blocked",
    ready: TIMEOUT.gatewayConfirmed,
  };
}

/** The full pre-cert smoke matrix. */
export function buildFullMatrix(): CertScenario[] {
  return [
    ...buildApprovalScenarios(),
    ...buildDeclineMatrix(),
    ...buildAvsMatrix(),
    ...buildCvvMatrix(),
    buildTimeoutScenario(),
  ];
}

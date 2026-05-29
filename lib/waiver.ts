import type { WaiverAcknowledgmentValue } from "@/types";

/* -------------------------------------------------------------------------- */
/* Waiver defaults — single source of truth for the builder + render sites.     */
/* The real waiver PDF is pending from the client; until it's uploaded, this    */
/* generic template is shown so the flow is complete and editable per semester. */
/* -------------------------------------------------------------------------- */

export const DEFAULT_WAIVER_TITLE = "Liability Waiver & Release";

export const DEFAULT_ACKNOWLEDGMENT_LABEL =
  "I have read, understand, and agree to the terms of this waiver on behalf of the participant.";

/**
 * Placeholder copy. Replace by uploading the official PDF, or by editing this
 * text per semester in the form builder. Not legal advice — generic filler.
 */
export const DEFAULT_WAIVER_BODY = `This is a placeholder waiver. Replace it by uploading the official waiver PDF, or edit this text in the registration form builder.

In consideration of being permitted to participate in programs, classes, and activities offered by the studio, the undersigned parent/guardian acknowledges and agrees to the following on behalf of the participant:

1. Assumption of Risk. Participation in dance and movement activities involves inherent risks, including the risk of physical injury. The undersigned voluntarily assumes all such risks.

2. Release of Liability. The undersigned releases and holds harmless the studio, its instructors, staff, and volunteers from any claims arising out of participation, except in cases of gross negligence or willful misconduct.

3. Medical Authorization. In the event of an emergency, the undersigned authorizes the studio to seek appropriate medical care for the participant.

4. Media Release. The undersigned grants permission for photographs and video of the participant taken during activities to be used for promotional purposes, unless the studio is notified otherwise in writing.

By checking the acknowledgment box below, the undersigned confirms they have read and agree to this waiver.`;

/* -------------------------------------------------------------------------- */
/* Acknowledgment value helpers                                                */
/* -------------------------------------------------------------------------- */

/** Normalize any stored value into a WaiverAcknowledgmentValue. */
export function coerceAcknowledgment(value: unknown): WaiverAcknowledgmentValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      acknowledged: o.acknowledged === true,
      acknowledgedAt:
        typeof o.acknowledgedAt === "string" ? o.acknowledgedAt : undefined,
    };
  }
  // Tolerate a bare boolean from older/simpler writers.
  return { acknowledged: value === true };
}

/** True when the family has checked the acknowledgment box. */
export function isAcknowledged(value: unknown): boolean {
  return coerceAcknowledgment(value).acknowledged;
}

/**
 * Build the value to store when the box is toggled. Stamps the time on check,
 * clears it on uncheck. `nowIso` is injected so callers control the clock.
 */
export function makeAcknowledgment(
  checked: boolean,
  nowIso: string,
): WaiverAcknowledgmentValue {
  return checked
    ? { acknowledged: true, acknowledgedAt: nowIso }
    : { acknowledged: false };
}

import type { AddressValue } from "@/types";

/* -------------------------------------------------------------------------- */
/* US states — single source of truth for the address-block state dropdown.    */
/* Shared by the public form, the admin preview, the admin register flow, and  */
/* the builder modal preview so the list never drifts across surfaces.         */
/* -------------------------------------------------------------------------- */

export const US_STATES: { value: string; label: string }[] = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

export const EMPTY_ADDRESS: AddressValue = {
  street: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
};

/* -------------------------------------------------------------------------- */
/* Coercion — form_data values are `unknown` (JSONB); normalize defensively.    */
/* -------------------------------------------------------------------------- */

/** Normalize any stored value into a complete AddressValue (missing parts → ""). */
export function coerceAddress(value: unknown): AddressValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      street: typeof o.street === "string" ? o.street : "",
      line2: typeof o.line2 === "string" ? o.line2 : "",
      city: typeof o.city === "string" ? o.city : "",
      state: typeof o.state === "string" ? o.state : "",
      zip: typeof o.zip === "string" ? o.zip : "",
    };
  }
  return { ...EMPTY_ADDRESS };
}

/* -------------------------------------------------------------------------- */
/* Auto-formatting — keeps addresses uniform across families.                  */
/* -------------------------------------------------------------------------- */

/** Digits only; inserts the ZIP+4 hyphen once past 5 digits. */
export function formatZip(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 9);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** Title-case each word — applied on blur so typing stays unobtrusive. */
export function titleCaseCity(input: string): string {
  return input
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Validation / display                                                        */
/* -------------------------------------------------------------------------- */

/** True when street, city, state, and zip are all filled (line2 is optional). */
export function isAddressComplete(value: unknown): boolean {
  const a = coerceAddress(value);
  return Boolean(a.street.trim() && a.city.trim() && a.state.trim() && a.zip.trim());
}

/** Render an address as a single comma-separated line (for summaries/exports). */
export function formatAddressOneLine(value: unknown): string {
  const a = coerceAddress(value);
  const line1 = [a.street, a.line2].filter((p) => p && p.trim()).join(", ");
  const cityState = [a.city, a.state].filter((p) => p && p.trim()).join(", ");
  const tail = [cityState, a.zip].filter((p) => p && p.trim()).join(" ");
  return [line1, tail].filter((p) => p && p.trim()).join(", ");
}

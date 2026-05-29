"use client";

import { US_STATES, coerceAddress, formatZip, titleCaseCity } from "@/lib/address";
import type { AddressValue } from "@/types";

/**
 * Renders the address-block sub-fields (street / line2 / city / state-dropdown /
 * zip) as one logical unit. Used by every surface that renders an
 * `inputType: "address"` question — the public registration form, the admin
 * preview, the admin register flow, and the builder modal preview — so the
 * state list and auto-formatting never diverge. Styling is supplied by the
 * caller via `inputClassName` / `selectClassName` so each surface keeps its own
 * design system.
 */
export default function AddressBlockField({
  value,
  onChange,
  inputClassName,
  selectClassName,
  disabled = false,
}: {
  value: unknown;
  onChange: (value: AddressValue) => void;
  inputClassName: string;
  /** Falls back to `inputClassName` when omitted. */
  selectClassName?: string;
  disabled?: boolean;
}) {
  const v = coerceAddress(value);
  const set = (patch: Partial<AddressValue>) => onChange({ ...v, ...patch });
  const selectCls = selectClassName ?? inputClassName;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        className={inputClassName}
        placeholder="Street address"
        autoComplete="address-line1"
        disabled={disabled}
        value={v.street}
        onChange={(e) => set({ street: e.target.value })}
      />

      <input
        className={inputClassName}
        placeholder="Apt, suite, unit (optional)"
        autoComplete="address-line2"
        disabled={disabled}
        value={v.line2 ?? ""}
        onChange={(e) => set({ line2: e.target.value })}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 8 }}>
        <input
          className={inputClassName}
          placeholder="City"
          autoComplete="address-level2"
          disabled={disabled}
          value={v.city}
          onChange={(e) => set({ city: e.target.value })}
          onBlur={(e) => set({ city: titleCaseCity(e.target.value) })}
        />

        <select
          className={selectCls}
          aria-label="State"
          autoComplete="address-level1"
          disabled={disabled}
          value={v.state}
          onChange={(e) => set({ state: e.target.value })}
        >
          <option value="">State</option>
          {US_STATES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value}
            </option>
          ))}
        </select>

        <input
          className={inputClassName}
          placeholder="ZIP"
          inputMode="numeric"
          autoComplete="postal-code"
          disabled={disabled}
          value={v.zip}
          onChange={(e) => set({ zip: formatZip(e.target.value) })}
        />
      </div>
    </div>
  );
}

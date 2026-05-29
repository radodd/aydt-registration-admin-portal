import { describe, it, expect } from "vitest";
import {
  renderRegistrationSummaryHtml,
  SAMPLE_REGISTRATION_SUMMARY,
} from "@/utils/email/buildRegistrationSummary";
import type { RegistrationSummary } from "@/types";

describe("renderRegistrationSummaryHtml", () => {
  it("returns empty string when there is nothing to show", () => {
    expect(renderRegistrationSummaryHtml({ participants: [] })).toBe("");
  });

  it("always renders the receipt header and the order-level money rows", () => {
    const html = renderRegistrationSummaryHtml(SAMPLE_REGISTRATION_SUMMARY);
    expect(html).toContain("Registration Summary");
    expect(html).toContain("Amount paid");
    expect(html).toContain("$240.00");
    expect(html).toContain("Season balance");
  });

  it("renders participant names, sessions, and registered-on date", () => {
    const html = renderRegistrationSummaryHtml(SAMPLE_REGISTRATION_SUMMARY);
    expect(html).toContain("Ava Martinez");
    expect(html).toContain("Registered on June 3, 2026");
    expect(html).toContain("Ballet I");
    expect(html).toContain("Mon/Wed · 4:00–5:00 PM");
    expect(html).toContain("Studio A");
    expect(html).toContain("Ms. Rivera");
    expect(html).toContain("Recital T-shirt — $25.00");
  });

  it("omits fields that have no data instead of showing empty labels", () => {
    const summary: RegistrationSummary = {
      participants: [
        { name: "Sam Lee", sessions: [{ name: "Jazz I" }] },
      ],
    };
    const html = renderRegistrationSummaryHtml(summary);
    expect(html).toContain("Jazz I");
    // No backing data → these labels must not appear at all.
    expect(html).not.toContain("Location:");
    expect(html).not.toContain("Classroom:");
    expect(html).not.toContain("Instructor:");
    expect(html).not.toContain("Amount paid");
  });

  it("escapes HTML in user-derived values", () => {
    const summary: RegistrationSummary = {
      participants: [
        {
          name: "Tom & <Jerry>",
          sessions: [{ name: "Tap \"Intro\"" }],
        },
      ],
    };
    const html = renderRegistrationSummaryHtml(summary);
    expect(html).toContain("Tom &amp; &lt;Jerry&gt;");
    expect(html).toContain("Tap &quot;Intro&quot;");
    expect(html).not.toContain("<Jerry>");
  });

  it("renders a section-only (full-term) summary with no drop-in rows", () => {
    const summary: RegistrationSummary = {
      participants: [
        {
          name: "Maya Patel",
          registeredOn: "May 1, 2026",
          sessions: [
            {
              name: "Contemporary (Full Term)",
              schedule: "Tue/Thu · 5:00–6:30 PM",
              instructor: "Mr. Diaz",
              amount: "$650.00",
            },
          ],
        },
      ],
      amountPaid: "$650.00",
      seasonBalance: "$0.00",
    };
    const html = renderRegistrationSummaryHtml(summary);
    expect(html).toContain("Maya Patel");
    expect(html).toContain("Contemporary (Full Term)");
    expect(html).toContain("Mr. Diaz");
    expect(html).toContain("$650.00");
  });
});

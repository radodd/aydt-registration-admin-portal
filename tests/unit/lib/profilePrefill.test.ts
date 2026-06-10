/**
 * Tests for lib/profilePrefill.ts (meeting-plan #35)
 *
 * Covers:
 *  - inferProfileSeedValue: label-fallback for forms whose questions were never
 *    tagged with `profileField` (single-field + combined-name labels)
 *  - conservative non-matching: ambiguous labels resolve to undefined (no
 *    wrong-fill)
 *  - reconcileSelectValue: stored grade vocabulary ("6") mapped onto whichever
 *    option vocabulary a form uses ("6th" / "6th Grade"), K / Pre-K synonyms
 */
import { describe, it, expect } from "vitest";
import {
  inferProfileSeedValue,
  reconcileSelectValue,
  type ProfileMap,
} from "@/lib/profilePrefill";

const MAP: ProfileMap = {
  dancer_first_name: "Heather",
  dancer_last_name: "Anderson",
  dancer_birth_date: "2015-02-09",
  dancer_grade: "6",
  parent_email: "parent@example.com",
  emergency_contact_first_name: "Kennedi",
  emergency_contact_last_name: "Anderson",
  emergency_contact_phone: "(555) 726-9302",
  emergency_contact_relationship: "Aunt",
};

describe("inferProfileSeedValue", () => {
  it("maps high-confidence single-field labels", () => {
    expect(inferProfileSeedValue("First Name", MAP)).toBe("Heather");
    expect(inferProfileSeedValue("Last Name", MAP)).toBe("Anderson");
    expect(inferProfileSeedValue("Date of Birth", MAP)).toBe("2015-02-09");
    expect(inferProfileSeedValue("Emergency Contact Relationship to the Child", MAP)).toBe("Aunt");
    expect(inferProfileSeedValue("Emergency Contact Cell Phone", MAP)).toBe("(555) 726-9302");
  });

  it("joins combined first+last name labels", () => {
    expect(inferProfileSeedValue("Emergency Contact Name", MAP)).toBe("Kennedi Anderson");
  });

  it("returns undefined for ambiguous labels (never wrong-fills)", () => {
    expect(inferProfileSeedValue("Email Address", MAP)).toBeUndefined();
    expect(inferProfileSeedValue("Home phone number", MAP)).toBeUndefined();
    expect(inferProfileSeedValue("How did you hear about us?", MAP)).toBeUndefined();
    expect(inferProfileSeedValue(undefined, MAP)).toBeUndefined();
  });

  it("returns undefined when the mapped value is absent", () => {
    expect(inferProfileSeedValue("School Name", MAP)).toBeUndefined();
  });
});

describe("reconcileSelectValue", () => {
  it("returns the value unchanged on an exact match", () => {
    expect(reconcileSelectValue("6th", ["1st", "6th", "12th"])).toBe("6th");
  });

  it("maps a bare number onto ordinal option vocabularies", () => {
    expect(reconcileSelectValue("6", ["1st", "2nd", "6th", "12th"])).toBe("6th");
    expect(
      reconcileSelectValue("6", ["1st Grade", "6th Grade", "12th Grade"]),
    ).toBe("6th Grade");
  });

  it("folds K / Pre-K synonyms", () => {
    expect(reconcileSelectValue("K", ["Kindergarten", "1st"])).toBe("Kindergarten");
    expect(reconcileSelectValue("Pre-K", ["Pre-School", "Kindergarten"])).toBe("Pre-School");
  });

  it("returns undefined when no option matches", () => {
    expect(reconcileSelectValue("Adult", ["1st", "2nd"])).toBeUndefined();
  });

  it("passes the value through when the question has no options", () => {
    expect(reconcileSelectValue("anything", undefined)).toBe("anything");
    expect(reconcileSelectValue("anything", [])).toBe("anything");
  });
});

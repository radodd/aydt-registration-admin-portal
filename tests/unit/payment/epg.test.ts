import { describe, it, expect } from "vitest";
import { epgEventTypeToPaymentState } from "@/utils/payment/epg";

describe("epgEventTypeToPaymentState", () => {
  it.each([
    ["saleAuthorized",    "authorized"],
    ["saleCaptured",      "captured"],
    ["saleSettled",       "settled"],
    ["saleDeclined",      "declined"],
    ["saleHeldForReview", "held_for_review"],
    ["voidAuthorized",    "voided"],
    ["refundAuthorized",  "refunded"],
  ])("%s → %s", (eventType, expectedState) => {
    expect(epgEventTypeToPaymentState(eventType)).toBe(expectedState);
  });

  it("returns null for unrecognised event types", () => {
    expect(epgEventTypeToPaymentState("unknownEvent")).toBeNull();
    expect(epgEventTypeToPaymentState("")).toBeNull();
    expect(epgEventTypeToPaymentState("SALEAUTHORIZED")).toBeNull(); // case-sensitive
  });
});

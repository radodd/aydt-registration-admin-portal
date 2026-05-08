import { describe, it, expect } from "vitest";
import { parseTimeInput } from "@/utils/parseTimeInput";

describe("parseTimeInput", () => {
  describe("12-hour with AM/PM", () => {
    it("parses afternoon time with PM", () => {
      expect(parseTimeInput("7:40 PM")).toBe("19:40");
    });

    it("accepts lowercase pm with no space", () => {
      expect(parseTimeInput("7:40pm")).toBe("19:40");
    });

    it("parses morning time with AM", () => {
      expect(parseTimeInput("9:15 AM")).toBe("09:15");
    });

    it("treats 12:30 AM as midnight hour (00:30)", () => {
      expect(parseTimeInput("12:30 AM")).toBe("00:30");
    });

    it("treats 12:30 PM as noon hour (12:30)", () => {
      expect(parseTimeInput("12:30 PM")).toBe("12:30");
    });

    it("trims whitespace", () => {
      expect(parseTimeInput("  7:40 PM  ")).toBe("19:40");
    });
  });

  describe("24-hour", () => {
    it("parses 24-hour format", () => {
      expect(parseTimeInput("19:40")).toBe("19:40");
    });

    it("zero-pads single-digit hour", () => {
      expect(parseTimeInput("7:40")).toBe("07:40");
    });

    it("accepts 00:00", () => {
      expect(parseTimeInput("00:00")).toBe("00:00");
    });

    it("accepts 23:59", () => {
      expect(parseTimeInput("23:59")).toBe("23:59");
    });
  });

  describe("invalid input", () => {
    it("rejects empty string", () => {
      expect(parseTimeInput("")).toBe(null);
    });

    it("rejects minutes >= 60", () => {
      expect(parseTimeInput("7:99 PM")).toBe(null);
    });

    it("rejects hour 0 in 12-hour format", () => {
      expect(parseTimeInput("0:30 AM")).toBe(null);
    });

    it("rejects hour > 12 in 12-hour format", () => {
      expect(parseTimeInput("13:30 PM")).toBe(null);
    });

    it("rejects 24-hour overflow", () => {
      expect(parseTimeInput("25:00")).toBe(null);
    });

    it("rejects garbage", () => {
      expect(parseTimeInput("abc")).toBe(null);
    });

    it("rejects single digit minutes", () => {
      expect(parseTimeInput("7:4 PM")).toBe(null);
    });

    it("rejects 12-hour without colon-padding pattern", () => {
      expect(parseTimeInput("740pm")).toBe(null);
    });
  });
});

import { describe, expect, it } from "vitest";
import { formatPaise, rupeesToPaise } from "./money";

describe("money", () => {
  it("converts rupees to paise without float errors", () => {
    expect(rupeesToPaise("100")).toBe(10000n);
    expect(rupeesToPaise("0.1")).toBe(10n);
    expect(rupeesToPaise("19.99")).toBe(1999n);
  });

  it("rejects invalid amounts", () => {
    expect(() => rupeesToPaise("-5")).toThrow();
    expect(() => rupeesToPaise("1.234")).toThrow();
    expect(() => rupeesToPaise("abc")).toThrow();
  });

  it("formats paise", () => {
    expect(formatPaise(10000n)).toBe("₹100.00");
    expect(formatPaise(5n)).toBe("₹0.05");
    expect(formatPaise(-250n)).toBe("-₹2.50");
  });
});
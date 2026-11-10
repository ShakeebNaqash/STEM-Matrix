import { describe, expect, it } from "vitest";
import { parseDecimal } from "@/lib/number";

describe("parseDecimal", () => {
  it.each(["9", " 9 ", "-3", "+2", "1.5e-3", ".5", "5."])("accepts %j", (text) => {
    expect(parseDecimal(text)).not.toBeNull();
  });

  it("keeps the numeric value", () => {
    expect(parseDecimal(" 9 ")).toBe(9);
    expect(parseDecimal("-3")).toBe(-3);
    expect(parseDecimal("+2")).toBe(2);
    expect(parseDecimal("1.5e-3")).toBeCloseTo(0.0015);
    expect(parseDecimal(".5")).toBe(0.5);
    expect(parseDecimal("5.")).toBe(5);
  });

  it.each(["0x9", "0b1", "0o7", "Infinity", "1e400", "", "abc", "1,000", "1_000", "9 N"])("rejects %j", (text) => {
    expect(parseDecimal(text)).toBeNull();
  });
});

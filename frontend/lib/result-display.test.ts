import { describe, expect, it } from "vitest";
import { toResultDisplay } from "@/lib/result-display";

const forceDetails = {
  unit: "N",
  preflight: {
    conversions: [
      { field: "mass", from: "500 g", to: "0.5 kg" },
      { field: "acceleration", from: "2 m/s^2", to: "2 m/s^2" },
    ],
  },
};

describe("toResultDisplay", () => {
  it("formats a number with its unit and keeps integers exact", () => {
    expect(toResultDisplay("physics_force", 1, 1, forceDetails)).toEqual({
      kind: "number",
      value: "1",
      unit: "N",
    });
  });

  it("formats a unit conversion from the result object", () => {
    expect(
      toResultDisplay(
        "unit_convert",
        { value: 5000, unit: "m", dimension: "length", input_value: 5, input_unit: "km" },
        null,
        {},
      ),
    ).toEqual({ kind: "number", value: "5000", unit: "m" });
  });

  it("keeps exact string solutions and labels them", () => {
    expect(toResultDisplay("solve_equation", ["2", "3", "sqrt(2)/2"], null, { variable: "x" })).toEqual({
      kind: "list",
      label: "Solutions for x",
      items: ["2", "3", "sqrt(2)/2"],
    });
  });

  it("formats complex eigenvalues", () => {
    expect(
      toResultDisplay(
        "matrix_eigenvalues",
        [
          { real: 0, imaginary: 1 },
          { real: 0, imaginary: -1 },
          { real: 3, imaginary: 0 },
        ],
        null,
        {},
      ),
    ).toEqual({ kind: "list", label: "Eigenvalues", items: ["i", "-i", "3"] });
  });

  it("rounds matrix entries to six significant figures", () => {
    expect(
      toResultDisplay(
        "matrix_inverse",
        [
          [0.6666666666666666, -0.3333333333333333],
          [-0.3333333333333333, 0.6666666666666666],
        ],
        null,
        {},
      ),
    ).toEqual({
      kind: "matrix",
      rows: [
        ["0.666667", "-0.333333"],
        ["-0.333333", "0.666667"],
      ],
    });
  });

  it("turns a system into assignments", () => {
    expect(toResultDisplay("solve_system", [{ x: "2", y: "1" }], null, {})).toEqual({
      kind: "assignments",
      sets: [[{ name: "x", value: "2" }, { name: "y", value: "1" }]],
    });
  });

  it("shows a balanced equation as text", () => {
    expect(
      toResultDisplay(
        "chemistry_balance_equation",
        { balanced_equation: "2H2 + O2 -> 2H2O", coefficients: [2, 1, 2] },
        null,
        {},
      ),
    ).toEqual({ kind: "text", value: "2H2 + O2 -> 2H2O" });
  });

  it("shows stats as a table and joins the mode list", () => {
    expect(
      toResultDisplay(
        "descriptive_stats",
        { count: 4, mean: 2.5, median: 2.5, mode: [1, 2, 3, 4], min: 1, max: 4 },
        null,
        {},
      ),
    ).toEqual({
      kind: "table",
      rows: [
        { label: "Count", value: "4" },
        { label: "Mean", value: "2.5" },
        { label: "Median", value: "2.5" },
        { label: "Mode", value: "1, 2, 3, 4" },
        { label: "Min", value: "1" },
        { label: "Max", value: "4" },
      ],
    });
  });

  it("turns negative zero into 0", () => {
    expect(toResultDisplay("evaluate", -0, null, {})).toEqual({ kind: "number", value: "0" });
  });

  it("uses scientific notation for very small and very large numbers", () => {
    expect(toResultDisplay("evaluate", 1.23456789e-8, null, {})).toEqual({
      kind: "number",
      value: "1.23457 × 10^-8",
    });
    expect(toResultDisplay("evaluate", 123456789, null, {})).toEqual({
      kind: "number",
      value: "1.23457 × 10^8",
    });
  });

  it("falls back to compact JSON for an unknown shape", () => {
    expect(toResultDisplay("evaluate", { surprise: { nested: true } }, null, {})).toEqual({
      kind: "text",
      value: '{"surprise":{"nested":true}}',
    });
  });
});

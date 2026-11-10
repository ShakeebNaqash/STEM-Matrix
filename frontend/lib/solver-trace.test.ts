import { describe, expect, it } from "vitest";
import { solverTrace } from "@/lib/solver-trace";

describe("solverTrace", () => {
  it("names a force calculation and keeps the formula and residual", () => {
    expect(
      solverTrace("physics_force", {
        formula: "F=m*a",
        unit: "N",
        residual: 0,
        preflight: { conversions: [] },
      }),
    ).toEqual({
      title: "Force (F = ma)",
      steps: [
        { label: "Formula", value: "F=m*a" },
        { label: "Check: substituted back", value: "0" },
      ],
    });
  });

  it("shows equation residuals and the variable that was solved", () => {
    expect(
      solverTrace("solve_equation", {
        equation: "x**2-5*x+6 = 0",
        variable: "x",
        symbolic_residuals: ["0", "0"],
        solution_count: 2,
      }),
    ).toEqual({
      title: "Solving an equation",
      steps: [
        { label: "Equation", value: "x**2-5*x+6 = 0" },
        { label: "Solved for", value: "x" },
        { label: "Check: substituted back", value: "residuals 0, 0" },
        { label: "Solutions found", value: "2" },
      ],
    });
  });

  it("shows the inverse check and a condition number", () => {
    const trace = solverTrace("matrix_inverse", {
      identity_residual_norm: 0,
      condition_number: 2.999999999999999,
    });
    expect(trace.title).toBe("Matrix inverse");
    expect(trace.steps[0]).toEqual({ label: "Check: A × A⁻¹ − I", value: "0" });
    expect(trace.steps[1]?.label).toBe("Condition number");
    expect(trace.steps[1]?.value.endsWith("(close to singular)")).toBe(false);
  });

  it("flags a huge condition number", () => {
    const trace = solverTrace("matrix_inverse", { condition_number: 1e9 });
    expect(trace.steps[0]?.value).toContain("(close to singular)");
  });

  it("lists balanced elements and the method", () => {
    expect(
      solverTrace("chemistry_balance_equation", {
        elements_balanced: ["H", "O"],
        method: "integer nullspace",
      }).steps,
    ).toEqual([
      { label: "Elements balanced", value: "H, O" },
      { label: "Method", value: "integer nullspace" },
    ]);
  });

  it("keeps only the title when details are empty", () => {
    expect(solverTrace("definite_integral", {})).toEqual({
      title: "Definite integral",
      steps: [],
    });
  });

  it("puts unknown keys in raw JSON and titles an unknown solver", () => {
    expect(solverTrace("custom_solver", { formula: "a=b", extra: { n: 1 } })).toEqual({
      title: "Custom Solver",
      steps: [{ label: "Formula", value: "a=b" }],
      raw: '{"extra":{"n":1}}',
    });
  });
});

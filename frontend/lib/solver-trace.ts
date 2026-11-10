import { formatNumber } from "@/lib/result-display";
import type { SolverTrace } from "@/lib/types";

const TITLES: Record<string, string> = {
  definite_integral: "Definite integral",
  indefinite_integral: "Indefinite integral",
  numerical_integral: "Numerical integral",
  simpson_integral: "Simpson integral",
  trapezoid_integral: "Trapezoid integral",
  differentiate: "Derivative",
  partial_differentiate: "Partial derivative",
  solve_equation: "Solving an equation",
  solve_system: "System of equations",
  solve_linear_system: "Linear system",
  polynomial_roots: "Polynomial roots",
  matrix_inverse: "Matrix inverse",
  matrix_eigenvalues: "Eigenvalues",
  matrix_determinant: "Determinant",
  matrix_multiply: "Matrix product",
  matrix_add: "Matrix sum",
  matrix_transpose: "Matrix transpose",
  matrix_rank: "Matrix rank",
  physics_force: "Force (F = ma)",
  physics_kinetic_energy: "Kinetic energy",
  physics_ohms_law: "Ohm's law",
  unit_convert: "Unit conversion",
  chemistry_balance_equation: "Balancing a chemical equation",
  chemistry_molar_mass: "Molar mass",
  descriptive_stats: "Descriptive statistics",
  engineering_reynolds: "Reynolds number",
};

const SKIPPED = new Set(["unit", "preflight"]);

const KNOWN = new Set([
  "formula",
  "equation",
  "variable",
  "residual",
  "symbolic_residuals",
  "identity_residual_norm",
  "condition_number",
  "solution_count",
  "elements_balanced",
  "method",
  "dimension_check",
]);

export function solverTrace(solver: string, details: unknown): SolverTrace {
  const record = isRecord(details) ? details : {};
  const steps: SolverTrace["steps"] = [];
  pushText(steps, "Formula", record.formula);
  pushText(steps, "Equation", record.equation);
  pushText(steps, "Solved for", record.variable);
  const check = substitutedBack(record.residual, record.symbolic_residuals);
  if (check) steps.push({ label: "Check: substituted back", value: check });
  if (typeof record.identity_residual_norm === "number") {
    steps.push({ label: "Check: A × A⁻¹ − I", value: formatNumber(record.identity_residual_norm) });
  }
  if (typeof record.condition_number === "number") {
    const note = record.condition_number > 1e8 ? " (close to singular)" : "";
    steps.push({ label: "Condition number", value: `${formatNumber(record.condition_number)}${note}` });
  }
  if (typeof record.solution_count === "number") {
    steps.push({ label: "Solutions found", value: formatNumber(record.solution_count) });
  }
  const elements = listText(record.elements_balanced);
  if (elements) steps.push({ label: "Elements balanced", value: elements });
  pushText(steps, "Method", record.method);
  const units = plainValue(record.dimension_check);
  if (units) steps.push({ label: "Units check", value: units });

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SKIPPED.has(key) || KNOWN.has(key)) continue;
    extra[key] = value;
  }
  const trace: SolverTrace = { title: solverTitle(solver), steps };
  if (Object.keys(extra).length > 0) trace.raw = JSON.stringify(extra);
  return trace;
}

function solverTitle(solver: string): string {
  const known = TITLES[solver];
  if (known) return known;
  const words = solver.split("_").filter((word) => word.length > 0);
  if (words.length === 0) return "Solver";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function substitutedBack(residual: unknown, symbolic: unknown): string | null {
  const listed = listText(symbolic);
  if (listed) return `residuals ${listed}`;
  if (typeof residual === "number") return formatNumber(residual);
  if (typeof residual === "string" && residual.trim()) return residual;
  return null;
}

function pushText(steps: SolverTrace["steps"], label: string, value: unknown) {
  if (typeof value === "string" && value.trim()) steps.push({ label, value });
  if (typeof value === "number") steps.push({ label, value: formatNumber(value) });
}

function listText(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const items = value.map((item) => (typeof item === "number" ? formatNumber(item) : typeof item === "string" ? item : ""));
  if (items.some((item) => item.length === 0)) return null;
  return items.join(", ");
}

function plainValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Passed" : "Failed";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

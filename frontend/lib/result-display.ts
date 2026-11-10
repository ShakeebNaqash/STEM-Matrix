import type { ResultDisplay } from "@/lib/types";

const CLARIFICATION_FALLBACK =
  "I couldn't turn that into a calculation I can check. Include the values and their units.";

export function toResultDisplay(
  solver: string,
  result: unknown,
  numericResult: unknown,
  details: unknown,
): ResultDisplay {
  const unit = recordString(details, "unit");
  const value = result === undefined || result === null ? numericResult : result;
  const fromNumber = asNumberDisplay(value, unit);
  if (fromNumber) return fromNumber;
  const fromList = asList(solver, value, details);
  if (fromList) return fromList;
  const fromMatrix = asMatrix(value);
  if (fromMatrix) return fromMatrix;
  const fromAssignments = asAssignments(value);
  if (fromAssignments) return fromAssignments;
  const fromObject = asObject(value);
  if (fromObject) return fromObject;
  return { kind: "text", value: compactJson(value) };
}

export function explainSolverError(error: string): string {
  const trimmed = error.trim();
  if (trimmed.startsWith("Invalid input:")) return trimmed;
  if (/singular matrix/i.test(trimmed)) return "That matrix has no inverse.";
  return "The solver could not finish this calculation.";
}

export function clarificationText(message: string, patterns: string[] | null): string {
  if (patterns === null || message.startsWith("Could not form a valid solver request")) {
    return CLARIFICATION_FALLBACK;
  }
  return message;
}

function asNumberDisplay(value: unknown, unit: string | undefined): ResultDisplay | null {
  if (typeof value !== "number") return null;
  const display: ResultDisplay = { kind: "number", value: formatNumber(value) };
  if (unit) display.unit = unit;
  return display;
}

function asList(solver: string, value: unknown, details: unknown): ResultDisplay | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.every(isComplex)) {
    return { kind: "list", label: listLabel(solver, details), items: value.map(formatComplex) };
  }
  if (value.every((item) => typeof item === "string")) {
    return { kind: "list", label: listLabel(solver, details), items: value };
  }
  return null;
}

function asMatrix(value: unknown): ResultDisplay | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isNumberRow)) return null;
  return {
    kind: "matrix",
    rows: value.map((row) => row.map((item) => formatNumber(item))),
  };
}

function asAssignments(value: unknown): ResultDisplay | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isAssignment)) return null;
  return {
    kind: "assignments",
    sets: value.map((row) =>
      Object.entries(row).map(([name, item]) => ({
        name,
        value: typeof item === "number" ? formatNumber(item) : item,
      })),
    ),
  };
}

function asObject(value: unknown): ResultDisplay | null {
  if (!isRecord(value)) return null;
  if (typeof value.balanced_equation === "string") {
    return { kind: "text", value: value.balanced_equation };
  }
  if (typeof value.value === "number" && typeof value.unit === "string") {
    return { kind: "number", value: formatNumber(value.value), unit: value.unit };
  }
  if (isTableRecord(value)) {
    return {
      kind: "table",
      rows: Object.entries(value).map(([key, item]) => ({
        label: labelize(key),
        value: tableValue(item),
      })),
    };
  }
  return null;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) return "0";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs > 1e6)) {
    const exp = Math.floor(Math.log10(abs));
    const mantissa = value / 10 ** exp;
    return `${trimSig(mantissa, 6)} × 10^${exp}`;
  }
  if (Number.isInteger(value)) return String(value);
  return trimSig(value, 6);
}

function trimSig(value: number, sig: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  const digits = Math.max(0, sig - Math.floor(Math.log10(abs)) - 1);
  const text = abs.toFixed(Math.min(20, digits));
  const trimmed = text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return negative ? `-${trimmed}` : trimmed;
}

function formatComplex(value: { real: number; imaginary: number }): string {
  const imagAbs = Math.abs(value.imaginary);
  if (imagAbs === 0) return formatNumber(value.real);
  const imagText = imagAbs === 1 ? "i" : `${formatNumber(imagAbs)}i`;
  const signedImag = value.imaginary < 0 ? `-${imagText}` : imagText;
  if (value.real === 0 || Object.is(value.real, -0)) return signedImag;
  return value.imaginary < 0
    ? `${formatNumber(value.real)} - ${imagText}`
    : `${formatNumber(value.real)} + ${imagText}`;
}

function listLabel(solver: string, details: unknown): string {
  switch (solver) {
    case "solve_equation":
    case "polynomial_roots": {
      const variable = recordString(details, "variable") ?? "x";
      return solver === "polynomial_roots" ? "Roots" : `Solutions for ${variable}`;
    }
    case "matrix_eigenvalues":
      return "Eigenvalues";
    case "solve_system":
      return "Solutions";
    default:
      return "Values";
  }
}

function isComplex(value: unknown): value is { real: number; imaginary: number } {
  return isRecord(value) && typeof value.real === "number" && typeof value.imaginary === "number";
}

function isNumberRow(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number");
}

function isAssignment(value: unknown): value is Record<string, string | number> {
  if (!isRecord(value) || isComplex(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, item]) => typeof item === "string" || typeof item === "number");
}

function isTableRecord(value: Record<string, unknown>): boolean {
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, item]) => isTableCell(item));
}

function isTableCell(value: unknown): boolean {
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return true;
  return Array.isArray(value) && value.every((item) => typeof item === "number" || typeof item === "string");
}

function tableValue(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "number" ? formatNumber(item) : item)).join(", ");
  }
  return compactJson(value);
}

function labelize(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function recordString(value: unknown, key: string): string | undefined {
  if (!isRecord(value) || typeof value[key] !== "string") return undefined;
  return value[key];
}

function compactJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return typeof text === "string" ? text : String(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

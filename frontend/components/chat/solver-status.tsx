import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { MathText } from "@/components/math-text";
import { SourceBadge } from "@/components/source-badge";
import { explainSolverError } from "@/lib/result-display";
import type { ResultDisplay, SolverOutcome, UnitConversion } from "@/lib/types";

export function SolverStatusLine({ status }: { status: SolverOutcome["status"] }) {
  switch (status) {
    case "verified":
      return (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CircleCheckIcon className="size-4 shrink-0" aria-hidden="true" />
          Checked by the solver
        </p>
      );
    case "unmatched":
      return (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
          The model&apos;s answer didn&apos;t match. Showing the solver&apos;s result.
        </p>
      );
    case "failed":
      return (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CircleXIcon className="size-4 shrink-0" aria-hidden="true" />
          The solver couldn&apos;t work this out
        </p>
      );
    default: {
      const neverStatus: never = status;
      return neverStatus;
    }
  }
}

export function OutcomeBody({ outcome }: { outcome: SolverOutcome }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <SolverStatusLine status={outcome.status} />
      {outcome.status === "failed" ? (
        <p className="text-sm leading-6">{explainSolverError(outcome.error ?? "")}</p>
      ) : null}
      {outcome.status === "unmatched" && outcome.display ? (
        <div>
          <SourceBadge source="solver" />
          <div className="mt-2">
            <ResultView display={outcome.display} />
          </div>
        </div>
      ) : null}
      {outcome.status === "verified" && outcome.display ? <ResultView display={outcome.display} /> : null}
      {outcome.conversions ? <ConversionNotes conversions={outcome.conversions} /> : null}
    </div>
  );
}

export function ConversionNotes({ conversions }: { conversions: UnitConversion[] }) {
  const shown = conversions.filter((item) => item.from !== item.to);
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
      {shown.map((item) => (
        <li key={`${item.field}-${item.from}-${item.to}`}>
          Read {item.from} as {item.to}.
        </li>
      ))}
    </ul>
  );
}

function ResultView({ display }: { display: ResultDisplay }) {
  switch (display.kind) {
    case "number":
      return <MathText text={numberMath(display.value, display.unit)} className="font-reading text-lg" />;
    case "list":
      return (
        <p className="font-reading text-base leading-7">
          <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{display.label}</span>
          <span className="mt-1 block">{display.items.join(", ")}</span>
        </p>
      );
    case "matrix":
      return <MathText text={matrixMath(display.rows)} className="font-reading" />;
    case "assignments":
      return (
        <div className="font-reading flex flex-col gap-1 text-base leading-7">
          {display.sets.map((set, index) => (
            <p key={set.map((item) => item.name).join("-") || String(index)}>
              {set.map((item) => `${item.name} = ${item.value}`).join(", ")}
            </p>
          ))}
        </div>
      );
    case "table":
      return (
        <table className="text-sm">
          <tbody>
            {display.rows.map((row) => (
              <tr key={row.label}>
                <th className="py-0.5 pr-4 text-left font-medium">{row.label}</th>
                <td className="py-0.5 font-mono">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "text":
      return <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-sm">{display.value}</pre>;
    default: {
      const neverDisplay: never = display;
      return neverDisplay;
    }
  }
}

function numberMath(value: string, unit?: string): string {
  const scientific = /^(-?[\d.]+) × 10\^(-?\d+)$/.exec(value);
  const core = scientific ? `${scientific[1]} \\times 10^{${scientific[2]}}` : value;
  if (!unit) return `$${core}$`;
  const safeUnit = unit.replace(/[^A-Za-z0-9^/-]/g, "");
  return `$${core}\\,\\mathrm{${safeUnit}}$`;
}

function matrixMath(rows: string[][]): string {
  const body = rows.map((row) => row.join(" & ")).join(" \\\\ ");
  return `$$\\begin{bmatrix}${body}\\end{bmatrix}$$`;
}

"""Input validation primitives: required inputs, numeric bounds and physical constraints.

Every problem is reported as an :class:`Issue` with a ``category`` that separates

* ``"missing"`` - a required value was not supplied (or is empty / null), from
* ``"invalid"`` - a value *was* supplied but cannot be used (wrong type, not finite,
  wrong unit/dimension, outside its physical range ...).

Quantities may be given as plain numbers (already in the solver's unit), as strings such as
``"500 g"`` or ``"25 °C"``, or as ``{"value": 500, "unit": "g"}`` and are converted to the
unit the solver expects.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.inputs.notation import NotationError, parse_plain_number
from app.inputs.units import (DIMENSIONLESS, Dimension, DimensionError, Quantity, Unit, UnitError,
                              parse_quantity, parse_unit)

MAX_LIST = 10_000


@dataclass(frozen=True)
class Issue:
    category: str            # "missing" | "invalid"
    code: str
    field: str | None
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {"category": self.category, "code": self.code, "field": self.field, "message": self.message}


def missing(field: str, message: str | None = None, code: str = "missing_input") -> Issue:
    return Issue("missing", code, field, message or f"Required input '{field}' is missing")


def invalid(field: str | None, message: str, code: str = "invalid_input") -> Issue:
    return Issue("invalid", code, field, message)


@dataclass(frozen=True)
class ParamSpec:
    """Specification of one named input (normally an ``extra_params`` entry)."""
    name: str
    kind: str = "number"                  # number | integer | number_list | matrix | text
    unit: str | None = None               # unit the solver expects; makes the input quantity-capable
    required: bool = True
    min: float | None = None
    max: float | None = None
    min_open: bool = False                # True -> value must be > min
    max_open: bool = False
    nonzero: bool = False
    temperature: str = "absolute"         # "absolute" or "delta" for temperature units
    min_len: int = 1
    distinct: bool = False
    constraint: str = ""                  # plain-language physical constraint shown in messages

    @property
    def dim(self) -> Dimension:
        return parse_unit(self.unit).dim if self.unit else DIMENSIONLESS


def _fmt(v: float) -> str:
    return f"{v:.12g}"


def _bounds_issue(spec: ParamSpec, value: float, label: str) -> Issue | None:
    if spec.min is not None and (value <= spec.min if spec.min_open else value < spec.min):
        rel = ">" if spec.min_open else ">="
        why = f" ({spec.constraint})" if spec.constraint else ""
        return invalid(spec.name, f"{label} must be {rel} {_fmt(spec.min)}{why}; got {_fmt(value)}", "out_of_range")
    if spec.max is not None and (value >= spec.max if spec.max_open else value > spec.max):
        rel = "<" if spec.max_open else "<="
        why = f" ({spec.constraint})" if spec.constraint else ""
        return invalid(spec.name, f"{label} must be {rel} {_fmt(spec.max)}{why}; got {_fmt(value)}", "out_of_range")
    if spec.nonzero and value == 0:
        return invalid(spec.name, f"{label} must not be zero", "out_of_range")
    return None


@dataclass
class ParamOutcome:
    value: Any = None
    issues: list[Issue] | None = None
    had_unit: bool = False
    conversion: dict[str, Any] | None = None
    notes: list[str] | None = None


def _scalar(spec: ParamSpec, raw: Any, out: ParamOutcome) -> float | None:
    label = spec.name
    if isinstance(raw, bool):
        out.issues.append(invalid(label, f"{label} must be a number, not a boolean", "invalid_type"))
        return None
    if isinstance(raw, (int, float)):
        value = float(raw)
        if not math.isfinite(value):
            out.issues.append(invalid(label, f"{label} must be a finite number", "not_finite"))
            return None
        return value
    unit_text: str | None = None
    number_text: str | None = None
    if isinstance(raw, dict):
        if set(raw) - {"value", "unit"} or "value" not in raw:
            out.issues.append(invalid(label, f"{label} must be a number or {{\"value\": ..., \"unit\": ...}}", "invalid_type"))
            return None
        inner, unit_text = raw["value"], raw.get("unit")
        if isinstance(inner, bool) or not isinstance(inner, (int, float, str)):
            out.issues.append(invalid(label, f"{label}.value must be a number", "invalid_type"))
            return None
        try:
            number = float(inner) if not isinstance(inner, str) else parse_plain_number(inner)
        except (NotationError, ValueError):
            out.issues.append(invalid(label, f"{label}.value '{inner}' is not a number", "invalid_type"))
            return None
        if not math.isfinite(number):
            out.issues.append(invalid(label, f"{label} must be a finite number", "not_finite"))
            return None
        if unit_text in (None, ""):
            return number
        number_text = f"{number!r}"
        raw_label = f"{raw['value']} {unit_text}"
    elif isinstance(raw, str):
        raw_label = raw.strip()
        if not raw_label:
            out.issues.append(missing(label, f"Required input '{label}' is empty"))
            return None
        number_text = raw_label
    else:
        out.issues.append(invalid(label, f"{label} must be a number or a quantity string such as '5 {spec.unit or 'kg'}'", "invalid_type"))
        return None

    # numeric or quantity string
    notes: list[str] = []
    try:
        if unit_text:
            q = Quantity(float(number_text), parse_unit(unit_text, expected=spec.dim, notes=notes))
        else:
            q = parse_quantity(number_text, expected=spec.dim, notes=notes)
    except (UnitError, NotationError) as exc:
        text = str(exc)
        kind = "unsupported_unit" if isinstance(exc, UnitError) else "invalid_type"
        if kind == "invalid_type":
            text = f"{label} '{raw_label}' is not a number ({text})"
        else:
            text = f"{label}: {text}"
        out.issues.append(invalid(label, text, kind))
        return None
    if not q.unit.symbol:                              # plain number inside a string
        return q.value
    if spec.unit is None:
        out.issues.append(invalid(label, f"{label} takes a plain number, but '{raw_label}' has a unit", "unexpected_unit"))
        return None
    target = parse_unit(spec.unit)
    if q.unit.dim != target.dim:
        out.issues.append(invalid(
            label,
            f"{label}: '{raw_label}' has dimension {q.unit.dim}, but {target.dim} is required "
            f"(solver unit: {spec.unit})", "dimension_mismatch"))
        return None
    try:
        value = q.to(target, delta=(spec.temperature == "delta"))
    except UnitError as exc:
        out.issues.append(invalid(label, f"{label}: {exc}", "unsupported_unit"))
        return None
    out.had_unit = True
    out.notes = notes
    out.conversion = {"field": label, "from": raw_label, "to": f"{_fmt(value)} {spec.unit}", "value": value, "unit": spec.unit}
    return value


def validate_param(spec: ParamSpec, raw: Any) -> ParamOutcome:
    """Validate and convert one input according to ``spec``."""
    out = ParamOutcome(issues=[])
    if raw is None:
        if spec.required:
            out.issues.append(missing(spec.name, f"Required input '{spec.name}' is missing"
                                      + (f" (expected {spec.dim.name()} in {spec.unit})" if spec.unit else "")))
        return out
    if spec.kind in ("number", "integer"):
        value = _scalar(spec, raw, out)
        if value is None:
            return out
        if spec.kind == "integer":
            if abs(value) > 2 ** 53 or value != round(value):
                out.issues.append(invalid(spec.name, f"{spec.name} must be a whole number; got {_fmt(value)}", "not_integer"))
                return out
            value = int(round(value))
        issue = _bounds_issue(spec, float(value), spec.name)
        if issue:
            out.issues.append(issue)
            return out
        out.value = value
        return out
    if spec.kind == "number_list":
        if not isinstance(raw, (list, tuple)):
            out.issues.append(invalid(spec.name, f"{spec.name} must be a list of numbers", "invalid_type"))
            return out
        if len(raw) < spec.min_len:
            out.issues.append(invalid(spec.name, f"{spec.name} needs at least {spec.min_len} value(s); got {len(raw)}", "too_few_values"))
            return out
        if len(raw) > MAX_LIST:
            out.issues.append(invalid(spec.name, f"{spec.name} has too many values (limit {MAX_LIST})", "too_many_values"))
            return out
        values = []
        for i, item in enumerate(raw):
            if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(float(item)):
                out.issues.append(invalid(spec.name, f"{spec.name}[{i}] must be a finite number; got {item!r}", "invalid_type"))
                return out
            issue = _bounds_issue(spec, float(item), f"{spec.name}[{i}]")
            if issue:
                out.issues.append(issue)
                return out
            values.append(float(item))
        if spec.distinct and len(set(values)) != len(values):
            out.issues.append(invalid(spec.name, f"{spec.name} values must be distinct", "not_distinct"))
            return out
        out.value = values
        return out
    if spec.kind == "matrix":
        if not isinstance(raw, (list, tuple)) or not raw or not all(isinstance(r, (list, tuple)) and r for r in raw):
            out.issues.append(invalid(spec.name, f"{spec.name} must be a non-empty list of equal-length rows", "invalid_type"))
            return out
        if len({len(r) for r in raw}) != 1:
            out.issues.append(invalid(spec.name, f"{spec.name} rows must all have the same length", "ragged_matrix"))
            return out
        rows = []
        for i, row in enumerate(raw):
            vals = []
            for j, item in enumerate(row):
                if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(float(item)):
                    out.issues.append(invalid(spec.name, f"{spec.name}[{i}][{j}] must be a finite number; got {item!r}", "invalid_type"))
                    return out
                vals.append(float(item))
            rows.append(vals)
        out.value = rows
        return out
    if spec.kind == "text":
        if not isinstance(raw, str) or not raw.strip():
            out.issues.append(missing(spec.name, f"Required input '{spec.name}' is empty") if isinstance(raw, str)
                              else invalid(spec.name, f"{spec.name} must be text", "invalid_type"))
            return out
        out.value = raw
        return out
    raise ValueError(f"Unknown ParamSpec kind {spec.kind!r}")  # programming error, not user input


def describe_issues(issues: list[Issue]) -> str:
    """One readable message: missing inputs first, then invalid ones."""
    miss = [i.message for i in issues if i.category == "missing"]
    bad = [i.message for i in issues if i.category == "invalid"]
    parts = []
    if miss:
        parts.append("Missing input: " + "; ".join(miss))
    if bad:
        parts.append("Invalid input: " + "; ".join(bad))
    return " | ".join(parts)

"""Universal preflight: every solver request passes through here before any calculation.

Pipeline for one :class:`~app.schemas.models.SolverRequest`
    1. normalise notation (``x²``/``x^2``/``x**2``, ``×``, ``−``, ``1.5×10⁻³`` ...)
    2. analyse variables (declared vs. used) and reject unsupported syntax/functions
    3. validate required inputs, numeric bounds and physical constraints, separating
       *missing* inputs from *invalid* ones
    4. parse quantities (``500 g``, ``2 m/s²``, ``25 °C``) and convert them to the unit the
       solver expects; incompatible dimensions are rejected, never silently combined
    5. check dimensional consistency of expressions/equations and of the expected result

On success the solver receives an equivalent, normalised request; on failure a
``status="failed"`` response with a clear message and machine-readable ``issues`` is
returned and the solver is not called.  Plain numbers keep their old meaning (already in
the solver's unit), so existing callers are unaffected.
"""
from __future__ import annotations

import ast
import math
import re
from dataclasses import dataclass, field
from typing import Any

from app.inputs import dimensions as dims_mod
from app.inputs.constraints import (Issue, ParamSpec, describe_issues, invalid, missing, validate_param)
from app.inputs.notation import (CONSTANT_NAMES, FUNCTION_ALIASES, FUNCTION_ARITY, NormalizationReport,
                                 NotationError, normalize_chemical_equation, normalize_chemical_formula,
                                 normalize_expression, parse_plain_number, split_equation)
from app.inputs.specs import (DEFINITE_INTEGRAL_FUNCTIONS, DOMAIN_SPECS, EXPRESSION_OPS, RESULT_RELATION, VARIABLE_MUST_APPEAR,
                              OpSpec, get_spec)
from app.inputs.units import (DIMENSIONLESS, Dimension, DimensionError, Quantity, UnitError, convert,
                              parse_quantity, parse_unit)
from app.schemas.models import SolverRequest, SolverResponse

_IDENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_RESERVED = frozenset(FUNCTION_ARITY) | frozenset(FUNCTION_ALIASES) | {"pi"}
_ALLOWED_NODES = (ast.Expression, ast.Constant, ast.Name, ast.BinOp, ast.UnaryOp, ast.Call, ast.Load,
                  ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.UAdd, ast.USub)
_INF_WORDS = {"oo": "oo", "+oo": "oo", "inf": "oo", "+inf": "oo", "infinity": "oo", "∞": "oo", "+∞": "oo",
              "-oo": "-oo", "-inf": "-oo", "-infinity": "-oo", "-∞": "-oo"}
MAX_NODES = 250


@dataclass
class PreflightResult:
    ok: bool
    request: SolverRequest
    issues: list[Issue] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    conversions: list[dict[str, Any]] = field(default_factory=list)
    dimension: dict[str, str] = field(default_factory=dict)
    expected_unit: str | None = None
    output_unit: str | None = None

    @property
    def error_message(self) -> str:
        return describe_issues(self.issues)

    def to_details(self) -> dict[str, Any]:
        out: dict[str, Any] = {"ok": self.ok}
        if self.issues:
            out["issues"] = [i.to_dict() for i in self.issues]
        if self.notes:
            out["notes"] = self.notes
        if self.conversions:
            out["conversions"] = self.conversions
        if self.dimension:
            out["dimension"] = self.dimension
        return out


class _Ctx:
    def __init__(self) -> None:
        self.issues: list[Issue] = []
        self.notes: list[str] = []
        self.conversions: list[dict[str, Any]] = []
        self.dimension: dict[str, str] = {}

    def note(self, *texts: str) -> None:
        for t in texts:
            if t and t not in self.notes:
                self.notes.append(t)


# --------------------------------------------------------------------------- #
# Expression analysis
# --------------------------------------------------------------------------- #
def analyze_expression(text: str, declared: list[str], field_name: str, ctx: _Ctx,
                       allowed_functions: frozenset[str] | None = None,
                       allow_names: bool = True) -> tuple[str | None, set[str]]:
    """Normalise ``text`` and check syntax, functions and variables.

    Returns ``(normalised_text, used_variable_names)``; ``normalised_text`` is None when
    issues were recorded.
    """
    report = NormalizationReport("")
    try:
        norm = normalize_expression(text, declared, report)
    except NotationError as exc:
        ctx.issues.append(invalid(field_name, f"{field_name}: {exc}", "notation_error"))
        return None, set()
    ctx.note(*report.notes)
    if not norm:
        ctx.issues.append(missing(field_name, f"Required input '{field_name}' is empty"))
        return None, set()
    try:
        tree = ast.parse(norm, mode="eval")
    except SyntaxError as exc:
        ctx.issues.append(invalid(field_name, f"{field_name} could not be parsed ({exc.msg}); check for missing "
                                              f"operators or unbalanced brackets in '{text}'", "parse_error"))
        return None, set()
    except (RecursionError, MemoryError, ValueError):
        ctx.issues.append(invalid(field_name, f"{field_name} is too deeply nested or malformed", "parse_error"))
        return None, set()
    nodes = list(ast.walk(tree))
    if len(nodes) > MAX_NODES:
        ctx.issues.append(invalid(field_name, f"{field_name} is too complex (limit {MAX_NODES} elements)", "too_complex"))
        return None, set()

    before = len(ctx.issues)
    call_funcs = {id(n.func) for n in nodes if isinstance(n, ast.Call)}
    names: set[str] = set()
    undeclared: list[str] = []
    for node in nodes:
        if not isinstance(node, _ALLOWED_NODES):
            ctx.issues.append(invalid(field_name, f"{field_name} uses unsupported syntax ({type(node).__name__}); "
                                                  f"only numbers, variables, + - * / ** % and supported functions are allowed",
                                      "unsupported_syntax"))
            return None, set()
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                ctx.issues.append(invalid(field_name, f"{field_name} may only contain numeric constants", "unsupported_syntax"))
                return None, set()
            if isinstance(node.value, float) and not math.isfinite(node.value):
                ctx.issues.append(invalid(field_name, f"{field_name} contains a non-finite constant", "not_finite"))
                return None, set()
        elif isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.keywords:
                ctx.issues.append(invalid(field_name, f"{field_name} uses an unsupported function call", "unsupported_function"))
                continue
            fname = node.func.id
            pool = allowed_functions if allowed_functions is not None else frozenset(FUNCTION_ARITY)
            if fname not in pool:
                ctx.issues.append(invalid(field_name, f"Unsupported function '{fname}' in {field_name}. Supported: "
                                                      + ", ".join(sorted(pool)), "unsupported_function"))
                continue
            lo, hi = FUNCTION_ARITY[fname]
            if not lo <= len(node.args) <= hi:
                want = str(lo) if lo == hi else f"{lo}-{hi}"
                ctx.issues.append(invalid(field_name, f"{fname}() takes {want} argument(s); got {len(node.args)}", "bad_arity"))
        elif isinstance(node, ast.Name) and id(node) not in call_funcs:
            n = node.id
            if n in declared:
                names.add(n)
            elif n in CONSTANT_NAMES:
                pass
            elif n in FUNCTION_ARITY:
                ctx.issues.append(invalid(field_name, f"Function '{n}' must be called with parentheses, e.g. {n}(x)", "unsupported_syntax"))
            elif n not in undeclared:
                undeclared.append(n)
    if undeclared:
        hint = ""
        if len(undeclared) == 1:
            hint = f" If '{undeclared[0]}' is the unknown, set variable='{undeclared[0]}'; if it is a parameter, add it to `variables`."
        else:
            hint = " Declare them with `variable` / `variables`."
        ctx.issues.append(invalid(field_name, f"Undeclared variable(s) in {field_name}: {', '.join(undeclared)}.{hint}",
                                  "undeclared_variable"))
    if len(ctx.issues) > before:
        return None, names
    return norm, names


def analyze_equation(text: str, declared: list[str], field_name: str, ctx: _Ctx) -> tuple[str | None, set[str]]:
    try:
        lhs, rhs = split_equation(text, declared)
    except NotationError as exc:
        ctx.issues.append(invalid(field_name, f"{field_name}: {exc}", "notation_error"))
        return None, set()
    has_eq = "=" in text.replace("＝", "=")
    before = len(ctx.issues)
    nl, names_l = analyze_expression(lhs, declared, field_name, ctx)
    nr, names_r = analyze_expression(rhs, declared, field_name, ctx)
    if len(ctx.issues) > before or nl is None or nr is None:
        return None, names_l | names_r
    return (f"{nl} = {nr}" if has_eq else nl), names_l | names_r


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _declared(req: SolverRequest, ctx: _Ctx) -> list[str]:
    names: list[str] = []
    candidates = [req.variable, *(req.variables or [])]
    if req.solver == "partial_differentiate" and req.target:
        candidates.append(req.target)
    for n in candidates:
        if not isinstance(n, str) or not _IDENT.match(n):
            ctx.issues.append(invalid("variables", f"Invalid variable name {n!r}; use letters, digits and underscores, "
                                                    f"starting with a letter", "invalid_variable_name"))
        elif n in _RESERVED:
            ctx.issues.append(invalid("variables", f"Variable name '{n}' is reserved (function or constant); choose another",
                                      "invalid_variable_name"))
        elif n not in names:
            names.append(n)
    return names


def _parse_point(value: Any, field_name: str, ctx: _Ctx) -> Any:
    """A limit/expansion point: number, +-infinity word, or constant expression like pi/2."""
    if isinstance(value, bool):
        ctx.issues.append(invalid(field_name, f"{field_name} must be a number, not a boolean", "invalid_type")); return None
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)):
            ctx.issues.append(invalid(field_name, f"{field_name} must be finite (use 'oo' for infinity)", "not_finite")); return None
        return value
    if isinstance(value, str):
        key = value.strip().lower().replace(" ", "")
        if key in _INF_WORDS:
            return _INF_WORDS[key]
        try:
            return parse_plain_number(value)
        except NotationError:
            pass
        norm, names = analyze_expression(value, [], field_name, ctx)
        return norm
    ctx.issues.append(invalid(field_name, f"{field_name} must be a number, 'oo', or a constant expression", "invalid_type"))
    return None


def _convert_unit_op(req: SolverRequest, extra: dict[str, Any], ctx: _Ctx) -> None:
    value, from_u, to_u = extra.get("value"), extra.get("from_unit"), extra.get("to_unit")
    if value is None:
        ctx.issues.append(missing("value", "Required input 'value' is missing"))
    if not to_u:
        ctx.issues.append(missing("to_unit", "Required input 'to_unit' is missing"))
    if value is None or not to_u:
        return
    notes: list[str] = []
    try:
        if isinstance(value, str) and not from_u:                     # "100 km/h" with no from_unit
            q = parse_quantity(value, notes=notes)
            if not q.unit.symbol:
                ctx.issues.append(missing("from_unit", "Required input 'from_unit' is missing"))
                return
            number, from_u = q.value, q.unit.symbol
        else:
            if not from_u:
                ctx.issues.append(missing("from_unit", "Required input 'from_unit' is missing"))
                return
            if isinstance(value, bool):
                ctx.issues.append(invalid("value", "value must be a number, not a boolean", "invalid_type")); return
            if isinstance(value, str):
                try:
                    number = parse_plain_number(value)
                except NotationError:
                    ctx.issues.append(invalid("value", f"value '{value}' already includes a unit; omit from_unit or give a plain number",
                                              "conflicting_units")); return
            else:
                number = float(value)
        if not math.isfinite(number):
            ctx.issues.append(invalid("value", "value must be a finite number", "not_finite")); return
        out = convert(number, str(from_u), str(to_u), delta=bool(extra.get("interval", False)), notes=notes)
    except DimensionError as exc:
        ctx.issues.append(invalid("to_unit", str(exc), "dimension_mismatch")); return
    except (UnitError, NotationError, ValueError) as exc:
        ctx.issues.append(invalid("from_unit/to_unit", str(exc), "unsupported_unit")); return
    ctx.note(*notes)
    extra["value"], extra["from_unit"], extra["to_unit"] = number, str(from_u), str(to_u)
    ctx.dimension["result"] = parse_unit(str(to_u)).dim.name()


def _build_dims(req: SolverRequest, extra: dict[str, Any], declared: list[str], ctx: _Ctx,
                subs_dims: dict[str, Dimension], plain_subs: set[str]) -> dict[str, Dimension] | None:
    raw_units = extra.get("units")
    dims: dict[str, Dimension] = {}
    if raw_units is not None:
        if not isinstance(raw_units, dict):
            ctx.issues.append(invalid("units", "units must map variable names to unit strings, e.g. {\"m\": \"kg\"}", "invalid_type"))
            return None
        for var, unit in raw_units.items():
            if var not in declared:
                ctx.issues.append(invalid("units", f"units refers to undeclared variable '{var}'", "undeclared_variable")); continue
            try:
                notes: list[str] = []
                dims[var] = parse_unit(str(unit), notes=notes).dim
                ctx.note(*notes)
            except UnitError as exc:
                ctx.issues.append(invalid("units", f"units['{var}']: {exc}", "unsupported_unit"))
    for var, d in subs_dims.items():
        if var in dims and dims[var] != d:
            ctx.issues.append(invalid("substitutions", f"substitution for '{var}' has dimension {d} but units declares {dims[var]}",
                                      "dimension_mismatch"))
        dims[var] = d
    for var in plain_subs:
        dims.setdefault(var, DIMENSIONLESS)
    return dims


def _check_dimensions(req: SolverRequest, extra: dict[str, Any], declared: list[str], norm: dict[str, str],
                      ctx: _Ctx, subs_dims: dict[str, Dimension], plain_subs: set[str]) -> None:
    op = req.solver
    has_units = extra.get("units") is not None or bool(subs_dims) or extra.get("expected_unit") is not None
    if not has_units:
        return
    before = len(ctx.issues)
    dims = _build_dims(req, extra, declared, ctx, subs_dims, plain_subs)
    expected_dim: Dimension | None = None
    if extra.get("expected_unit") is not None:
        try:
            expected_dim = parse_unit(str(extra["expected_unit"])).dim
        except UnitError as exc:
            ctx.issues.append(invalid("expected_unit", str(exc), "unsupported_unit"))
    if dims is None or len(ctx.issues) > before:
        return
    try:
        if op == "solve_system":
            for i, eq in enumerate(req.equations or []):
                dims_mod.check_equation_dimensions(norm["equations"][i], dims)
            ctx.dimension["system"] = "all equations are dimensionally consistent"
            return
        text = norm["expression"]
        if op in ("solve_equation",):
            eq_dim = dims_mod.check_equation_dimensions(text, dims)
            ctx.dimension["equation"] = str(eq_dim)
            result_dim = dims.get(req.variable)
            if result_dim is None:
                raise dims_mod.MissingUnitError([req.variable])
        else:
            expr_dim = dims_mod.infer_dimension(text, dims)
            ctx.dimension["expression"] = str(expr_dim)
            rel = RESULT_RELATION.get(op)
            result_dim = expr_dim
            if rel in ("per_var", "times_var", "per_target"):
                var = req.target if rel == "per_target" and req.target else req.variable
                if var not in dims:
                    raise dims_mod.MissingUnitError([var])
                result_dim = expr_dim / dims[var] if rel != "times_var" else expr_dim * dims[var]
            if op == "binomial_expansion" and req.degree:
                result_dim = expr_dim ** req.degree
        ctx.dimension["result"] = str(result_dim)
        if expected_dim is not None and result_dim != expected_dim:
            ctx.issues.append(invalid("expected_unit", f"Result has dimension {result_dim} but expected_unit "
                                                       f"'{extra['expected_unit']}' is {expected_dim}", "dimension_mismatch"))
    except dims_mod.MissingUnitError as exc:
        ctx.issues.append(missing("units", f"No unit declared for variable(s): {', '.join(exc.names)}. Add them to "
                                           f"extra_params.units (or give them as quantities in substitutions)", "missing_unit"))
    except DimensionError as exc:
        ctx.issues.append(invalid("expression", str(exc), "dimension_mismatch"))
    except UnitError as exc:
        ctx.issues.append(invalid("units", str(exc), "unsupported_unit"))


# --------------------------------------------------------------------------- #
# The preflight
# --------------------------------------------------------------------------- #
def _preflight(req: SolverRequest) -> PreflightResult:
    op = req.solver
    ctx = _Ctx()
    extra = dict(req.extra_params)
    updates: dict[str, Any] = {}
    spec: OpSpec | None = get_spec(op)
    declared = _declared(req, ctx)
    norm: dict[str, Any] = {}
    subs_dims: dict[str, Dimension] = {}
    plain_subs: set[str] = set()
    used_names: set[str] = set()

    # ---- expression / equation(s) ---------------------------------------
    if op in EXPRESSION_OPS:
        if not req.expression:
            ctx.issues.append(missing("expression"))
        else:
            funcs = DEFINITE_INTEGRAL_FUNCTIONS if op == "definite_integral" else None
            if op == "solve_equation":
                text, used_names = analyze_equation(req.expression, declared, "expression", ctx)
            else:
                text, used_names = analyze_expression(req.expression, declared, "expression", ctx, funcs)
            if text is not None:
                norm["expression"] = text
                updates["expression"] = text
                if op in VARIABLE_MUST_APPEAR and req.variable not in used_names:
                    ctx.issues.append(invalid("variable", f"The variable '{req.variable}' does not appear in the expression; "
                                                          f"set `variable` to the unknown you want to solve for", "variable_not_in_expression"))
    elif op == "solve_system":
        if not req.equations:
            ctx.issues.append(missing("equations"))
        if not req.variables:
            ctx.issues.append(missing("variables", "Required input 'variables' is missing (list the unknowns)"))
        if req.equations and req.variables:
            eqs, ok = [], True
            for i, eq in enumerate(req.equations):
                t, _ = analyze_equation(eq, list(req.variables), f"equations[{i}]", ctx)
                ok = ok and t is not None
                eqs.append(t)
            if ok:
                norm["equations"] = eqs
                updates["equations"] = eqs
                if len(eqs) < len(req.variables):
                    ctx.note(f"{len(eqs)} equation(s) for {len(req.variables)} unknowns: the system is underdetermined")
                elif len(eqs) > len(req.variables):
                    ctx.note(f"{len(eqs)} equations for {len(req.variables)} unknowns: the system is overdetermined")

    # ---- required top-level fields --------------------------------------
    if spec:
        for name in spec.top_required:
            value = getattr(req, name, None)
            if value is None or value == []:
                ctx.issues.append(missing(name))
    if op in ("descriptive_stats", "mean", "median", "mode", "variance", "standard_deviation", "percentile"):
        data = req.data if req.data is not None else req.values
        if not data:
            ctx.issues.append(missing("data", "Required input 'data' (or 'values') is missing or empty"))
    if op in ("bisection_root", "numerical_root", "numerical_integral", "trapezoid_integral",
              "simpson_integral", "definite_integral"):
        lo, hi = req.lower_bound, req.upper_bound
        if lo is not None and hi is not None:
            if op == "definite_integral":
                if lo > hi:
                    ctx.issues.append(invalid("lower_bound", "Lower bound must not exceed upper bound", "out_of_range"))
            elif lo >= hi:
                ctx.issues.append(invalid("lower_bound", "lower_bound must be less than upper_bound", "out_of_range"))
    if op == "numerical_root" and (req.method or "brentq") in ("brentq", "brent", "bisect", "bisection"):
        if req.lower_bound is None or req.upper_bound is None:
            ctx.issues.append(missing("lower_bound/upper_bound", "This root-finding method requires lower_bound and upper_bound"))
    if op == "numerical_root" and (req.method or "") == "newton" and req.initial_guess is None:
        ctx.issues.append(missing("initial_guess", "Newton method requires initial_guess"))

    # ---- named parameters (quantities, bounds, physical constraints) ----
    had_unit: dict[str, bool] = {}
    values: dict[str, Any] = {}
    if op == "unit_convert":
        _convert_unit_op(req, extra, ctx)
    elif op == "chemistry_molar_mass":
        formula = extra.get("formula")
        if formula is None or (isinstance(formula, str) and not formula.strip()):
            ctx.issues.append(missing("formula", "Required input 'formula' is missing, e.g. H2O"))
        elif not isinstance(formula, str):
            ctx.issues.append(invalid("formula", "formula must be text, e.g. 'H2O'", "invalid_type"))
        else:
            try:
                extra["formula"] = normalize_chemical_formula(formula)
            except NotationError as exc:
                ctx.issues.append(invalid("formula", str(exc), "notation_error"))
    elif op == "chemistry_balance_equation":
        equation = extra.get("equation")
        if equation is None or (isinstance(equation, str) and not equation.strip()):
            ctx.issues.append(missing("equation", "Required input 'equation' is missing, e.g. H2 + O2 -> H2O"))
        elif not isinstance(equation, str):
            ctx.issues.append(invalid("equation", "equation must be text", "invalid_type"))
        else:
            try:
                left, right, notes = normalize_chemical_equation(equation)
                extra["equation"] = " + ".join(left) + " -> " + " + ".join(right)
                ctx.note(*notes)
            except NotationError as exc:
                ctx.issues.append(invalid("equation", str(exc), "notation_error"))
    elif spec and spec.params:
        for p in spec.params:
            raw = extra.get(p.name)
            if op == "convert_number_base" and p.name == "value" and isinstance(raw, int) and not isinstance(raw, bool):
                raw = str(raw)
            out = validate_param(p, raw)
            ctx.issues.extend(out.issues or [])
            if out.value is not None:
                values[p.name] = out.value
                extra[p.name] = out.value
            if out.conversion:
                ctx.conversions.append(out.conversion)
            ctx.note(*(out.notes or []))
            had_unit[p.name] = out.had_unit
        for group in spec.same_units:
            present = [n for n in group if n in values]
            if len(group) > 1 and 0 < sum(had_unit.get(n, False) for n in present) < len(present):
                ctx.issues.append(invalid("/".join(group), f"If one of {', '.join(group)} is given with a unit, give all of them "
                                                           f"with units (plain numbers are assumed to be in the solver's unit)",
                                          "inconsistent_units"))
        if not any(i.category == "invalid" and i.field in {p.name for p in spec.params} for i in ctx.issues):
            for rule in spec.rules:
                rule(values, extra, ctx.issues)
        if op in ("variance", "standard_deviation") and "ddof" in values:
            data = req.data if req.data is not None else req.values
            if data and values["ddof"] >= len(data):
                ctx.issues.append(invalid("ddof", f"ddof ({values['ddof']}) must be smaller than the number of observations ({len(data)})",
                                          "out_of_range"))
        if op == "sequence_sum":
            values.setdefault("start", 1); values.setdefault("stop", 10)
    if op == "normal_probability":
        side = extra.get("side", "less")
        if side not in ("less", "greater", "between"):
            ctx.issues.append(invalid("side", "side must be 'less', 'greater' or 'between'", "invalid_choice"))
        elif side == "between":
            lo, hi = values.get("lower"), values.get("upper")
            if lo is None: ctx.issues.append(missing("lower"))
            if hi is None: ctx.issues.append(missing("upper"))
            if lo is not None and hi is not None and lo > hi:
                ctx.issues.append(invalid("lower", "For 'between', lower must be <= upper", "out_of_range"))
        elif values.get("x") is None:
            ctx.issues.append(missing("x", "Required input 'x' is missing (extra_params.x)"))
    if op in ("limit", "taylor_series"):
        raw_point = extra.get("point")
        if raw_point is None:
            if op == "limit":
                ctx.issues.append(missing("point", "Required input 'point' is missing (the value the variable approaches)"))
        else:
            point = _parse_point(raw_point, "point", ctx)
            if point is not None:
                extra["point"] = point
        direction = extra.get("direction")
        if op == "limit" and direction is not None and direction not in ("+", "-", "+-"):
            ctx.issues.append(invalid("direction", "direction must be '+', '-' or '+-'", "invalid_choice"))

    # ---- substitutions for evaluate/arithmetic ---------------------------
    if op in ("evaluate", "arithmetic"):
        subs_raw = extra.get("substitutions")
        subs: dict[str, float] = {}
        bad_subs: set[str] = set()
        if subs_raw is not None:
            if not isinstance(subs_raw, dict):
                ctx.issues.append(invalid("substitutions", "substitutions must map variable names to numbers or quantities", "invalid_type"))
            else:
                for var, raw in subs_raw.items():
                    if var not in declared:
                        ctx.issues.append(invalid("substitutions", f"Substitution for undeclared variable '{var}'", "undeclared_variable")); continue
                    if isinstance(raw, dict):
                        raw = f"{raw.get('value')} {raw.get('unit') or ''}".strip()
                    bad_subs.add(var)
                    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
                        ctx.issues.append(invalid("substitutions", f"substitutions['{var}'] must be a number or a quantity such as '5 kg'", "invalid_type")); continue
                    try:
                        notes: list[str] = []
                        q = parse_quantity(str(raw), notes=notes)
                        ctx.note(*notes)
                    except (UnitError, NotationError) as exc:
                        ctx.issues.append(invalid("substitutions", f"substitutions['{var}']: {exc}", "invalid_input")); continue
                    if not math.isfinite(q.value):
                        ctx.issues.append(invalid("substitutions", f"substitutions['{var}'] must be finite", "not_finite")); continue
                    bad_subs.discard(var)
                    if q.unit.symbol:
                        subs[var] = q.to_si()
                        subs_dims[var] = q.unit.dim
                        ctx.conversions.append({"field": f"substitutions.{var}", "from": str(raw),
                                                "to": f"{subs[var]:.12g} (SI)", "value": subs[var]})
                    else:
                        subs[var] = q.value; plain_subs.add(var)
                extra["substitutions"] = subs
        unresolved = sorted(n for n in used_names if n not in subs and n not in bad_subs)
        if norm.get("expression") and unresolved:
            ctx.issues.append(missing("substitutions", f"No value for variable(s): {', '.join(unresolved)}. "
                                                       f"Provide extra_params.substitutions, e.g. {{\"{unresolved[0]}\": 2}}",
                                      "missing_value"))

    # ---- dimensional consistency ----------------------------------------
    if norm and (op in EXPRESSION_OPS or op == "solve_system"):
        _check_dimensions(req, extra, declared, norm, ctx, subs_dims, plain_subs)
    expected_unit = None
    output_unit = spec.output_unit if spec else None
    if spec and op in DOMAIN_SPECS:
        out_dim = DIMENSIONLESS if output_unit == "1" else (parse_unit(output_unit).dim if output_unit else None)
        if out_dim is not None:
            ctx.dimension["result"] = out_dim.name()
        if extra.get("expected_unit") is not None:
            try:
                exp_dim = parse_unit(str(extra["expected_unit"])).dim
                if out_dim is None:
                    ctx.note("expected_unit ignored: this operation returns several quantities")
                elif exp_dim != out_dim:
                    ctx.issues.append(invalid("expected_unit", f"{op} returns {out_dim} but expected_unit "
                                                               f"'{extra['expected_unit']}' is {exp_dim}", "dimension_mismatch"))
                else:
                    expected_unit = str(extra["expected_unit"])
            except UnitError as exc:
                ctx.issues.append(invalid("expected_unit", str(exc), "unsupported_unit"))

    ok = not ctx.issues
    new_req = req.model_copy(update={**updates, "extra_params": extra}) if ok else req
    return PreflightResult(ok, new_req, ctx.issues, ctx.notes, ctx.conversions, ctx.dimension, expected_unit, output_unit)


def preflight(request: SolverRequest) -> PreflightResult:
    """Run the shared input layer; never raises, never lets unchecked input through on internal error."""
    try:
        return _preflight(request)
    except Exception as exc:                                    # noqa: BLE001 - fail closed
        return PreflightResult(False, request, [invalid(None, f"Input validation failed unexpectedly ({type(exc).__name__}); "
                                                              f"the request was not calculated", "preflight_error")])


def failure_response(request: SolverRequest, result: PreflightResult) -> SolverResponse:
    return SolverResponse(request_id=request.request_id, status="failed", solver=request.solver,
                          error=result.error_message, details={"preflight": result.to_details()})


def _annotate(response: SolverResponse, result: PreflightResult) -> SolverResponse:
    if response.status != "success":
        return response
    details = dict(response.details or {})
    info = result.to_details()
    if result.expected_unit and result.output_unit and response.numeric_result is not None:
        try:
            value = Quantity(response.numeric_result, parse_unit(result.output_unit)).to(result.expected_unit)
            info["converted_result"] = {"value": value, "unit": result.expected_unit}
        except UnitError:
            pass
    if len(info) > 1:                                  # more than just {"ok": true}
        details["preflight"] = info
    return response.model_copy(update={"details": details})


class PreflightSolver:
    """Wraps any solver so that its input always goes through :func:`preflight` first."""

    def __init__(self, inner: Any):
        self._inner = inner
        self.name = inner.name

    def __getattr__(self, item: str) -> Any:               # operations, etc.
        return getattr(self._inner, item)

    def solve(self, request: SolverRequest) -> SolverResponse:
        result = preflight(request)
        if not result.ok:
            return failure_response(request, result)
        return _annotate(self._inner.solve(result.request), result)

"""Core deterministic mathematics solvers for StemMatrix.

Inputs are structured requests; expression parsing uses a restricted AST allow-list
and never eval(). These solvers are educational computational tools, not a CAS
security boundary: deploy with process/resource limits for untrusted workloads.
"""
from __future__ import annotations
import ast
import math
import operator
from typing import Any

import numpy as np
import sympy as sp
from scipy import integrate as scipy_integrate
from scipy import optimize, stats

from app.inputs.notation import FUNCTION_ARITY, NotationError, normalize_expression
from app.inputs.notation import split_equation as _split_equation
from app.schemas.models import SolverRequest, SolverResponse, VerificationResult

_BINOPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
           ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod}
_UNOPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_FUNCS = {
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "sec": sp.sec, "csc": sp.csc, "cot": sp.cot,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan, "atan2": sp.atan2,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh, "asinh": sp.asinh, "acosh": sp.acosh, "atanh": sp.atanh,
    "exp": sp.exp, "log": sp.log, "ln": sp.log, "log10": lambda v: sp.log(v, 10), "log2": lambda v: sp.log(v, 2),
    "sqrt": sp.sqrt, "cbrt": sp.cbrt, "abs": sp.Abs,
    "floor": sp.floor, "ceiling": sp.ceiling, "factorial": sp.factorial,
}
MAX_FACTORIAL = 1000
MAX_RESULT_DIGITS = 1000


def normalize_math_expression(source: str, variables: list[str] | None = None) -> str:
    """Normalize common human math notation without evaluating user code.

    Thin wrapper around the shared notation normalizer (``app.inputs.notation``).
    """
    try:
        return normalize_expression(str(source), variables)
    except NotationError as exc:
        raise ValueError(str(exc)) from exc


def split_equation(source: str, variables: list[str] | None = None) -> tuple[str, str]:
    """Split an equation into sides; a missing right-hand side means zero."""
    try:
        return _split_equation(source, variables)
    except NotationError as exc:
        raise ValueError(str(exc)) from exc


def safe_expr(source: str, variables: list[str] | None = None) -> sp.Expr:
    source = normalize_math_expression(source, variables)
    if not source or len(source) > 1000:
        raise ValueError("Expression must contain 1–1000 characters")
    allowed_names = set(variables or [])
    try:
        tree = ast.parse(source, mode="eval")
    except (SyntaxError, ValueError, RecursionError) as exc:
        raise ValueError("Expression could not be parsed") from exc
    if sum(1 for _ in ast.walk(tree)) > 250:
        raise ValueError("Expression is too complex")
    symbols = {name: sp.Symbol(name) for name in allowed_names}

    def visit(node):
        if isinstance(node, ast.Expression): return visit(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ValueError("Only numeric constants are allowed")
            if isinstance(node.value, float) and not math.isfinite(node.value):
                raise ValueError("Non-finite constants are not allowed")
            return sp.sympify(str(node.value))
        if isinstance(node, ast.Name):
            if node.id in symbols: return symbols[node.id]
            if node.id == "pi": return sp.pi
            if node.id in ("E", "e"): return sp.E
            raise ValueError(f"Unsupported name: {node.id}")
        if isinstance(node, ast.BinOp):
            op = _BINOPS.get(type(node.op))
            if op is None: raise ValueError("Unsupported arithmetic operator")
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Pow) and right.is_number:
                try:
                    exponent = abs(float(right))
                    if left.is_number:
                        # numeric power: bound the size of the result (digits), not just the exponent
                        mag = max(abs(float(sp.N(left))) if left.is_real else 1.0, 2.0)
                        if exponent * math.log10(mag) > MAX_RESULT_DIGITS: raise ValueError("Result of power is too large")
                    elif exponent > 100: raise ValueError("Exponent magnitude is limited to 100")
                except (TypeError, OverflowError): raise ValueError("Unsupported exponent")
            return op(left, right)
        if isinstance(node, ast.UnaryOp):
            op = _UNOPS.get(type(node.op))
            if op is None: raise ValueError("Unsupported unary operator")
            return op(visit(node.operand))
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.keywords:
                raise ValueError("Unsupported function call")
            fn = _FUNCS.get(node.func.id)
            lo, hi = FUNCTION_ARITY.get(node.func.id, (1, 1))
            if fn is None or not lo <= len(node.args) <= hi:
                raise ValueError("Unsupported function or argument count")
            args = [visit(a) for a in node.args]
            if node.func.id == "factorial" and args[0].is_number:
                try:
                    if float(args[0]) > MAX_FACTORIAL: raise ValueError(f"factorial argument is limited to {MAX_FACTORIAL}")
                except TypeError: pass
            return fn(*args)
        raise ValueError(f"Unsupported expression element: {type(node).__name__}")
    return visit(tree)


def _jsonable(value: Any):
    if isinstance(value, dict): return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [_jsonable(v) for v in value]
    if isinstance(value, np.ndarray): return value.tolist()
    if isinstance(value, np.generic): return value.item()
    if isinstance(value, (sp.Basic,)): return str(value)
    if isinstance(value, float) and not math.isfinite(value): return str(value)
    return value


def _point(value: Any):
    """Convert a limit/expansion point to a SymPy value WITHOUT sympify() on strings (which uses eval)."""
    if isinstance(value, bool): raise ValueError("point must be a number, not a boolean")
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)): raise ValueError("point must be finite")
        return sp.nsimplify(value) if isinstance(value, float) else sp.Integer(value)
    if isinstance(value, str):
        key = value.strip().lower().replace(" ", "")
        if key in ("oo", "+oo", "inf", "+inf", "infinity", "∞"): return sp.oo
        if key in ("-oo", "-inf", "-infinity", "-∞"): return -sp.oo
        return safe_expr(value, [])
    raise ValueError("point must be a number, 'oo', or a constant expression")


def _floats(values, name):
    out = []
    for v in values:
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(float(v)):
            raise ValueError(f"{name} must contain only finite numbers")
        out.append(float(v))
    return out


def _trapezoid(y, x):
    return (np.trapezoid if hasattr(np, "trapezoid") else np.trapz)(y, x)


class CoreMathSolver:
    """One registry-backed solver supporting a broad core-mathematics catalogue."""
    name = "core_math"
    operations = {
        # foundations / arithmetic
        "evaluate", "arithmetic", "simplify", "expand", "factor", "fraction_simplify",
        "percentage", "gcd_lcm", "convert_number_base",
        # algebra / equations
        "solve_equation", "solve_system", "polynomial_roots", "partial_fraction",
        "sequence_sum", "binomial_expansion",
        # calculus
        "differentiate", "partial_differentiate", "indefinite_integral", "limit", "taylor_series",
        # linear algebra
        "matrix_add", "matrix_multiply", "matrix_transpose", "matrix_determinant", "matrix_inverse",
        "matrix_rank", "matrix_eigenvalues", "solve_linear_system", "vector_dot", "vector_cross",
        "vector_norm",
        # numerical methods
        "numerical_root", "bisection_root", "newton_root", "numerical_integral", "trapezoid_integral",
        "simpson_integral", "interpolate", "linear_regression",
        # statistics / probability
        "descriptive_stats", "mean", "median", "mode", "variance", "standard_deviation",
        "z_score", "normal_probability", "binomial_probability", "correlation", "percentile",
    }

    def solve(self, request: SolverRequest) -> SolverResponse:
        op = request.solver
        if op not in self.operations:
            return SolverResponse(request_id=request.request_id, status="failed", solver=op,
                                  error=f"Unsupported core mathematics operation: {op}")
        try:
            result, details, exact, numeric, verification = self._execute(op, request)
            return SolverResponse(request_id=request.request_id, status="success", solver=op,
                exact_result=exact, numeric_result=numeric, result=_jsonable(result),
                details=_jsonable(details), verification=VerificationResult(passed=verification[0], message=verification[1]))
        except (ValueError, TypeError, ZeroDivisionError, ArithmeticError, OverflowError, IndexError, KeyError, np.linalg.LinAlgError) as exc:
            return SolverResponse(request_id=request.request_id, status="failed", solver=op, error=str(exc))
        except Exception as exc:
            return SolverResponse(request_id=request.request_id, status="failed", solver=op,
                                  error=f"Calculation failed ({type(exc).__name__})")

    def _execute(self, op: str, r: SolverRequest):
        expr = lambda: safe_expr(r.expression or "", [r.variable] + (r.variables or []) + ([r.target] if r.target else []))
        x = sp.Symbol(r.variable)
        details: dict[str, Any] = {}
        passed, message = True, "Operation completed; input/operation checks passed"
        exact = None; numeric = None
        if op in {"evaluate", "arithmetic"}:
            value = expr()
            subs = {sp.Symbol(k): sp.nsimplify(v) if isinstance(v, float) else v for k, v in (r.extra_params.get("substitutions") or {}).items()}
            if subs: value = value.subs(subs)
            if value.free_symbols: raise ValueError("Expression has unresolved variables")
            value = sp.simplify(value)
            if value.has(sp.zoo) or value.has(sp.nan) or value.has(sp.oo) or value.has(-sp.oo):
                raise ValueError("Expression is undefined or infinite (division by zero, log(0), tan(pi/2) ...)")
            exact = str(value)
            if value.is_number and value.is_real:
                numeric = float(sp.N(value)); result = numeric
            else: result = str(value)
        elif op in {"simplify", "expand", "factor", "fraction_simplify"}:
            value = expr()
            result_expr = {"simplify": sp.simplify, "expand": sp.expand, "factor": sp.factor,
                           "fraction_simplify": sp.cancel}[op](value)
            result = str(result_expr); exact = result
            passed = sp.simplify(value - result_expr) == 0
            message = "Symbolic equivalence check passed" if passed else "Symbolic equivalence check failed"
        elif op == "percentage":
            for key in ("value", "percent"):
                if r.extra_params.get(key) is None: raise ValueError(f"Missing required extra_params.{key}")
            value = float(r.extra_params["value"]); pct = float(r.extra_params["percent"])
            result = value * pct / 100; numeric = float(result); exact = str(result)
            details = {"value": value, "percent": pct, "formula": "value * percent / 100"}
        elif op == "gcd_lcm":
            vals = r.extra_params.get("integers")
            if not isinstance(vals, list) or not vals or any(not isinstance(v, int) or isinstance(v, bool) for v in vals):
                raise ValueError("extra_params.integers must be a non-empty list of integers")
            g = math.gcd(*vals); l = math.lcm(*vals)
            result = {"gcd": g, "lcm": l}; details = {"integers": vals}
        elif op == "convert_number_base":
            val = r.extra_params.get("value"); base = int(r.extra_params.get("base", 10)); source_base = int(r.extra_params.get("source_base", 10))
            if not 2 <= base <= 36 or not 2 <= source_base <= 36: raise ValueError("Bases must be between 2 and 36")
            n = int(str(val), source_base)
            digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"; out = "0" if n == 0 else ""
            sign = "-" if n < 0 else ""; n = abs(n)
            while n: out = digits[n % base] + out; n //= base
            result = sign + out; details = {"source_base": source_base, "target_base": base}
        elif op == "solve_equation":
            source = r.expression or ""
            lhs_text, rhs_text = split_equation(source)
            symbols = [r.variable] + (r.variables or [])
            lhs = safe_expr(lhs_text, symbols)
            rhs = safe_expr(rhs_text, symbols)
            solutions = sp.solve(sp.Eq(lhs, rhs), x)
            result = [str(s) for s in solutions]; exact = str(result); details = {"equation": source, "variable": r.variable}
            residuals = [sp.simplify(lhs.subs(x, sol) - rhs.subs(x, sol)) for sol in solutions]
            def _zero(res):
                if res == 0: return True
                try: return abs(complex(sp.N(res, 30))) < 1e-9
                except (TypeError, ValueError): return False
            passed = bool(solutions) and all(_zero(res) for res in residuals)
            if not solutions and sp.simplify(lhs - rhs) == 0:
                result = ["all values"]; exact = "identity"; passed = True
                solutions = []; residuals = []
                details["note"] = "The equation holds for every value of the variable (identity)"
            details["symbolic_residuals"] = [str(res) for res in residuals]
            details["solution_count"] = len(solutions)
            if result == ["all values"]: details["solution_count"] = "infinite"
            message = ("Solutions substituted into the equation; residuals are zero" if passed
                       else "No solutions returned or at least one solution failed substitution check")
        elif op == "solve_system":
            if not r.equations or not r.variables: raise ValueError("Provide equations and variables")
            syms = [sp.Symbol(v) for v in r.variables]
            eqs = []
            for equation in r.equations:
                lhs_text, rhs_text = split_equation(equation)
                lhs = safe_expr(lhs_text, r.variables)
                rhs = safe_expr(rhs_text, r.variables)
                eqs.append(sp.Eq(lhs, rhs))
            sols = sp.solve(eqs, syms, dict=True)
            result = [{str(k): str(v) for k, v in s.items()} for s in sols]; exact = str(result)
            details = {"equations": r.equations, "variables": r.variables}
            passed = all(all(sp.simplify(eq.lhs.subs(s) - eq.rhs.subs(s)) == 0 for eq in eqs) for s in sols)
            message = "System solutions substituted into original equations" if passed else "System substitution check failed"
        elif op == "polynomial_roots":
            roots = sp.solve(sp.Eq(expr(), 0), x)
            result = [str(v) for v in roots]; exact = str(result); details = {"variable": r.variable}
            residuals = [sp.simplify(expr().subs(x, root)) for root in roots]
            def _z(res):
                if res == 0: return True
                try: return abs(complex(sp.N(res, 30))) < 1e-9
                except (TypeError, ValueError): return False
            passed = bool(roots) and all(_z(res) for res in residuals)
            details["symbolic_residuals"] = [str(res) for res in residuals]
            details["root_count"] = len(roots)
            message = "Roots substituted into polynomial; residuals are zero" if passed else "No roots returned or root verification failed"
        elif op == "partial_fraction":
            result = str(sp.apart(expr(), x)); exact = result
        elif op == "sequence_sum":
            start = r.extra_params.get("start", 1); stop = r.extra_params.get("stop", 10)
            if any(isinstance(v, bool) or not isinstance(v, int) and not (isinstance(v, float) and v.is_integer()) for v in (start, stop)):
                raise ValueError("start and stop must be whole numbers")
            start, stop = int(start), int(stop)
            if start > stop: raise ValueError("start must not exceed stop")
            if stop - start > 100000: raise ValueError("Sequence range is too large")
            val = expr(); result = str(sp.summation(val, (x, start, stop))); exact = result
        elif op == "binomial_expansion":
            if r.degree is None: raise ValueError("Provide degree for binomial expansion")
            result = str(sp.expand(expr() ** r.degree)); exact = result
        elif op == "differentiate":
            value = sp.diff(expr(), x); result = str(value); exact = result
            passed = sp.simplify(sp.diff(expr(), x) - value) == 0; message = "Derivative symbolic check passed"
        elif op == "partial_differentiate":
            var = r.target or r.variable; sym = sp.Symbol(var)
            value = sp.diff(expr(), sym); result = str(value); exact = result; details = {"variable": var}
        elif op == "indefinite_integral":
            value = sp.integrate(expr(), x)
            if value.has(sp.Integral): raise ValueError("No supported symbolic antiderivative found")
            result = str(value); exact = result; details = {"constant_of_integration": "+ C"}
            passed = sp.simplify(sp.diff(value, x) - expr()) == 0
            message = "Differentiated antiderivative matches integrand" if passed else "Antiderivative verification failed"
        elif op == "limit":
            point = r.extra_params.get("point")
            if point is None: raise ValueError("Provide extra_params.point")
            direction = str(r.extra_params.get("direction", "+-"))
            if direction not in ("+", "-", "+-"): raise ValueError("direction must be '+', '-' or '+-'")
            result = str(sp.limit(expr(), x, _point(point), dir=direction)); exact = result
        elif op == "taylor_series":
            point = _point(r.extra_params.get("point", 0)); degree = r.degree or 5
            result = str(sp.series(expr(), x, point, degree + 1).removeO()); exact = result
        elif op.startswith("matrix_") or op in {"solve_linear_system", "vector_dot", "vector_cross", "vector_norm"}:
            result, details, exact, numeric, passed, message = self._linear_algebra(op, r)
        elif op in {"numerical_root", "bisection_root", "newton_root"}:
            result, details, exact, numeric, passed, message = self._root(op, r)
        elif op in {"numerical_integral", "trapezoid_integral", "simpson_integral"}:
            result, details, exact, numeric, passed, message = self._numeric_integral(op, r)
        elif op == "interpolate":
            xs = r.extra_params.get("x_values"); ys = r.extra_params.get("y_values"); at = r.extra_params.get("at")
            if not (isinstance(xs, list) and isinstance(ys, list) and len(xs) == len(ys) >= 2 and at is not None): raise ValueError("Provide matching x_values/y_values lists and at")
            xs = _floats(xs, "x_values"); ys = _floats(ys, "y_values"); at = _floats([at], "at")[0]
            if len(set(xs)) != len(xs): raise ValueError("x_values must be distinct")
            poly = sp.interpolate(list(zip(xs, ys)), x); result = float(poly.subs(x, at)); numeric = result
            exact = str(sp.simplify(poly.subs(x, at))); details = {"interpolating_polynomial": str(sp.expand(poly)), "at": at}
        elif op == "linear_regression":
            xs = np.asarray(r.extra_params.get("x_values", []), dtype=float); ys = np.asarray(r.extra_params.get("y_values", []), dtype=float)
            if len(xs) != len(ys) or len(xs) < 2: raise ValueError("Provide at least two paired x_values and y_values")
            if not np.all(np.isfinite(xs)) or not np.all(np.isfinite(ys)): raise ValueError("x_values and y_values must be finite")
            if np.ptp(xs) == 0: raise ValueError("x_values are all identical; a regression line is undefined")
            slope, intercept = np.polyfit(xs, ys, 1); pred = slope * xs + intercept
            result = {"slope": float(slope), "intercept": float(intercept), "r_squared": float(1 - np.sum((ys-pred)**2) / np.sum((ys-ys.mean())**2)) if np.sum((ys-ys.mean())**2) else 1.0}
            details = {"sample_count": len(xs), "model": "y = slope*x + intercept"}
        elif op in {"descriptive_stats", "mean", "median", "mode", "variance", "standard_deviation", "percentile"}:
            data = self._data(r); arr = np.asarray(data, dtype=float)
            if op == "mean": result = float(np.mean(arr))
            elif op == "median": result = float(np.median(arr))
            elif op == "mode":
                vals, counts = np.unique(arr, return_counts=True); maxc = counts.max(); result = vals[counts == maxc].tolist()
            elif op in ("variance", "standard_deviation"):
                ddof = r.extra_params.get("ddof", 0)
                if isinstance(ddof, bool) or int(ddof) != ddof or ddof < 0: raise ValueError("ddof must be a non-negative whole number")
                if int(ddof) >= arr.size: raise ValueError("ddof must be smaller than the number of observations")
                result = float((np.var if op == "variance" else np.std)(arr, ddof=int(ddof)))
            elif op == "percentile":
                p = float(r.extra_params.get("percentile", 50))
                if not 0 <= p <= 100: raise ValueError("percentile must be in [0, 100]")
                result = float(np.percentile(arr, p))
            else:
                result = {"count": int(arr.size), "mean": float(np.mean(arr)), "median": float(np.median(arr)),
                    "mode": self._modes(arr), "min": float(np.min(arr)), "max": float(np.max(arr)),
                    "range": float(np.ptp(arr)), "population_variance": float(np.var(arr)),
                    "sample_variance": float(np.var(arr, ddof=1)) if arr.size > 1 else None,
                    "population_std_dev": float(np.std(arr)), "sample_std_dev": float(np.std(arr, ddof=1)) if arr.size > 1 else None,
                    "q1": float(np.percentile(arr, 25)), "q3": float(np.percentile(arr, 75))}
            if isinstance(result, (int, float, np.number)): numeric = float(result); exact = str(result)
        elif op == "z_score":
            for key in ("value", "mean", "standard_deviation"):
                if r.extra_params.get(key) is None: raise ValueError(f"Missing required extra_params.{key}")
            value = float(r.extra_params["value"]); mean = float(r.extra_params["mean"]); sd = float(r.extra_params["standard_deviation"])
            if sd <= 0: raise ValueError("standard_deviation must be positive")
            result = (value - mean) / sd; numeric = float(result); exact = str(result)
        elif op == "normal_probability":
            mean = float(r.extra_params.get("mean", 0)); sd = float(r.extra_params.get("standard_deviation", 1))
            if sd <= 0: raise ValueError("standard_deviation must be positive")
            side = r.extra_params.get("side", "less")
            if side == "less":
                if "x" not in r.extra_params: raise ValueError("Provide extra_params.x")
                z = (float(r.extra_params["x"]) - mean) / sd
                result = float(stats.norm.cdf(z))
            elif side == "greater":
                if "x" not in r.extra_params: raise ValueError("Provide extra_params.x")
                z = (float(r.extra_params["x"]) - mean) / sd
                result = float(stats.norm.sf(z))
            elif side == "between":
                lo, hi = r.extra_params.get("lower"), r.extra_params.get("upper")
                if lo is None or hi is None or lo > hi: raise ValueError("For between, provide lower <= upper")
                result = float(stats.norm.cdf((hi-mean)/sd) - stats.norm.cdf((lo-mean)/sd))
            else: raise ValueError("side must be less, greater, or between")
            numeric = result; exact = str(result); details = {"mean": mean, "standard_deviation": sd, "side": side}
        elif op == "binomial_probability":
            raw_n, raw_k = r.extra_params.get("n", -1), r.extra_params.get("k", -1)
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or int(v) != v for v in (raw_n, raw_k)):
                raise ValueError("n and k must be whole numbers")
            n = int(raw_n); k = int(raw_k); p = float(r.extra_params.get("p", -1))
            if n < 0 or k < 0 or k > n or not 0 <= p <= 1: raise ValueError("Require n >= 0, 0 <= k <= n, and 0 <= p <= 1")
            result = float(stats.binom.pmf(k, n, p)); numeric = result; exact = str(result)
            details = {"n": n, "k": k, "p": p, "formula": "C(n,k) p^k (1-p)^(n-k)"}
        elif op == "correlation":
            xs = np.asarray(r.extra_params.get("x_values", []), dtype=float); ys = np.asarray(r.extra_params.get("y_values", []), dtype=float)
            if len(xs) != len(ys) or len(xs) < 2: raise ValueError("Provide at least two paired x_values and y_values")
            if np.std(xs) == 0 or np.std(ys) == 0: raise ValueError("Correlation is undefined for constant data")
            result = float(np.corrcoef(xs, ys)[0, 1]); numeric = result; exact = str(result)
        else:
            raise ValueError(f"Operation not implemented: {op}")
        if numeric is None and isinstance(result, (float, int, np.number)) and math.isfinite(float(result)):
            numeric = float(result)
        return result, details, exact, numeric, (bool(passed), message)

    @staticmethod
    def _data(r):
        data = r.data if r.data is not None else r.values
        if not data: raise ValueError("Provide a non-empty data or values list")
        return data

    @staticmethod
    def _modes(arr):
        vals, counts = np.unique(arr, return_counts=True); maxc = counts.max()
        return vals[counts == maxc].tolist()

    def _linear_algebra(self, op, r):
        passed, message, details, numeric, exact = True, "Linear-algebra consistency checks passed", {}, None, None
        if op == "solve_linear_system":
            if r.matrix is None or r.vector is None: raise ValueError("Provide matrix and vector")
            A = np.asarray(r.matrix, dtype=float); b = np.asarray(r.vector, dtype=float)
            if A.ndim != 2 or A.shape[0] != A.shape[1] or b.shape != (A.shape[0],): raise ValueError("Require square matrix A and matching vector b")
            sol = np.linalg.solve(A, b); residual = A @ sol - b
            result = sol.tolist(); numeric = None; exact = str(result); details = {"residual_norm": float(np.linalg.norm(residual))}
            passed = bool(np.linalg.norm(residual) <= r.tolerance * max(1.0, np.linalg.norm(b)))
        elif op.startswith("matrix_"):
            if r.matrix is None: raise ValueError("Provide matrix")
            A = np.asarray(r.matrix, dtype=float)
            if A.ndim != 2 or not A.size: raise ValueError("Matrix must be non-empty and rectangular")
            if any(len(row) != len(r.matrix[0]) for row in r.matrix): raise ValueError("Matrix rows must have equal lengths")
            if op == "matrix_transpose": result = A.T.tolist()
            elif op == "matrix_determinant":
                if A.shape[0] != A.shape[1]: raise ValueError("Determinant requires a square matrix")
                numeric = float(np.linalg.det(A)); result = numeric
            elif op == "matrix_inverse":
                if A.shape[0] != A.shape[1]: raise ValueError("Inverse requires a square matrix")
                inv = np.linalg.inv(A); result = inv.tolist()
                cond = float(np.linalg.cond(A)); resid = float(np.linalg.norm(A @ inv - np.eye(A.shape[0])))
                details = {"identity_residual_norm": resid, "condition_number": cond}
                if resid > 1e-8 or cond > 1e10:
                    passed = False; message = f"Matrix is numerically ill-conditioned (condition number {cond:.3g}); inverse is unreliable"
            elif op == "matrix_rank": result = int(np.linalg.matrix_rank(A))
            elif op == "matrix_eigenvalues":
                if A.shape[0] != A.shape[1]: raise ValueError("Eigenvalues require a square matrix")
                result = [{"real": float(v.real), "imaginary": float(v.imag)} for v in np.linalg.eigvals(A)]
            elif op == "matrix_add":
                B = np.asarray(r.extra_params.get("matrix_b"), dtype=float)
                if B.shape != A.shape: raise ValueError("Matrices must have matching dimensions")
                result = (A + B).tolist()
            elif op == "matrix_multiply":
                B = np.asarray(r.extra_params.get("matrix_b"), dtype=float)
                if B.ndim != 2 or A.shape[1] != B.shape[0]: raise ValueError("Provide compatible extra_params.matrix_b")
                result = (A @ B).tolist()
            else: raise ValueError("Unsupported matrix operation")
            exact = str(result)
        elif op.startswith("vector_"):
            a = np.asarray(r.values or [], dtype=float); b = np.asarray(r.extra_params.get("vector_b", []), dtype=float)
            if a.size == 0: raise ValueError("Provide values as the first vector")
            if op in {"vector_dot", "vector_cross"} and a.shape != b.shape: raise ValueError("Vectors must have matching dimensions")
            if op == "vector_dot": result = float(np.dot(a, b))
            elif op == "vector_cross":
                if a.size != 3: raise ValueError("Cross product requires 3D vectors")
                result = np.cross(a, b).tolist()
            else: result = float(np.linalg.norm(a))
            exact = str(result); numeric = float(result) if isinstance(result, (float, int, np.number)) else None
        return result, details, exact, numeric, passed, message

    def _root(self, op, r):
        # Newton's method is an open method and only needs an initial guess.
        # Bisection and Brent's method require a bracketing interval.
        if op == "newton_root":
            if r.initial_guess is None:
                raise ValueError("Newton's method requires initial_guess")
        elif r.lower_bound is None or r.upper_bound is None:
            raise ValueError("This root-finding method requires lower_bound and upper_bound")

        if op != "newton_root" and r.lower_bound >= r.upper_bound:
            raise ValueError("lower_bound must be less than upper_bound")

        expr = safe_expr(r.expression or "", [r.variable])
        fn_expr = sp.lambdify(sp.Symbol(r.variable), expr, modules=["numpy"])

        def fn(v):
            y = float(fn_expr(v))
            if not math.isfinite(y):
                raise ValueError("Function returned a non-finite value")
            return y

        if op == "newton_root":
            root = float(optimize.newton(fn, r.initial_guess, tol=r.tolerance, maxiter=r.max_iterations))
            method_used = "newton"
        elif op == "bisection_root":
            root = float(optimize.bisect(fn, r.lower_bound, r.upper_bound, xtol=r.tolerance, maxiter=r.max_iterations))
            method_used = "bisection"
        else:
            method = r.method or "brentq"
            if method == "newton":
                if r.initial_guess is None:
                    raise ValueError("Newton method requires initial_guess")
                root = float(optimize.newton(fn, r.initial_guess, tol=r.tolerance, maxiter=r.max_iterations))
            elif method in {"bisect", "bisection"}:
                root = float(optimize.bisect(fn, r.lower_bound, r.upper_bound, xtol=r.tolerance, maxiter=r.max_iterations))
            elif method in {"brentq", "brent"}:
                root = float(optimize.brentq(fn, r.lower_bound, r.upper_bound, xtol=r.tolerance, maxiter=r.max_iterations))
            else:
                raise ValueError("method must be one of: brentq, bisect, newton")
            method_used = method

        residual = abs(fn(root))
        passed = residual <= max(r.tolerance * 10, 1e-7)
        return root, {"method": method_used, "residual": residual}, str(root), root, passed, "Root residual within tolerance" if passed else "Root residual exceeds tolerance"

    def _numeric_integral(self, op, r):
        if r.lower_bound is None or r.upper_bound is None: raise ValueError("Provide lower_bound and upper_bound")
        if r.lower_bound >= r.upper_bound: raise ValueError("lower_bound must be less than upper_bound")
        expr = safe_expr(r.expression or "", [r.variable]); fn_expr = sp.lambdify(sp.Symbol(r.variable), expr, modules=["numpy"])
        def fn(v):
            out = np.asarray(fn_expr(v), dtype=float)
            if out.ndim == 0: out = np.full(np.shape(v), float(out))   # constant integrand
            if not np.all(np.isfinite(out)): raise ValueError("Integrand returned non-finite values")
            return out
        a, b = float(r.lower_bound), float(r.upper_bound)
        if op == "numerical_integral":
            val, error = scipy_integrate.quad(lambda t: float(fn(t)), a, b, epsabs=r.tolerance, limit=min(r.max_iterations, 1000))
            details = {"method": "adaptive_quadrature", "estimated_absolute_error": float(error)}
        else:
            n = int(r.extra_params.get("n", 1000))
            if n < 2 or n > 1_000_000: raise ValueError("extra_params.n must be between 2 and 1000000")
            if op == "simpson_integral" and n % 2: n += 1
            xs = np.linspace(a, b, n + 1); ys = fn(xs)
            if op == "trapezoid_integral": val = float(_trapezoid(ys, xs)); method = "composite_trapezoid"
            else: val = float(scipy_integrate.simpson(ys, x=xs)); method = "composite_simpson"
            details = {"method": method, "subintervals": n}
        if not math.isfinite(float(val)): raise ValueError("Integral result is not finite")
        return float(val), details, str(float(val)), float(val), True, "Numerical integration completed; error estimate/step method reported"

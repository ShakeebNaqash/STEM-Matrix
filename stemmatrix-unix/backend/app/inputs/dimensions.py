"""Dimensional consistency checks for expressions and equations.

The analysis walks the *syntax tree* of the (already normalised) expression, not the
simplified SymPy result, so ``m + d - d`` is still reported as mixing a mass with a
distance even though SymPy would cancel the ``d`` terms.
"""
from __future__ import annotations

import ast
import math
from fractions import Fraction
from typing import Mapping

from app.inputs.notation import CONSTANT_NAMES, FUNCTION_ARITY, normalize_expression, split_equation
from app.inputs.units import DIMENSIONLESS, Dimension, DimensionError, UnitError

# functions whose argument must be dimensionless and which return a dimensionless value
_DIMENSIONLESS_FUNCS = {
    "sin", "cos", "tan", "sec", "csc", "cot", "asin", "acos", "atan", "sinh", "cosh", "tanh",
    "asinh", "acosh", "atanh", "exp", "log", "ln", "log10", "log2", "factorial",
}
_SAME_DIM_FUNCS = {"abs", "floor", "ceiling"}


class MissingUnitError(UnitError):
    """A variable used in the expression has no declared unit."""

    def __init__(self, names: list[str]):
        self.names = names
        super().__init__("No unit declared for variable(s): " + ", ".join(names))


def _const_value(node: ast.AST) -> float | None:
    """Numeric value of an AST made only of constants, or None if it has variables."""
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return float(node.value)
    if isinstance(node, ast.Name) and node.id in ("pi", "E", "e"):
        return math.pi if node.id == "pi" else math.e
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _const_value(node.operand)
        return None if v is None else (-v if isinstance(node.op, ast.USub) else v)
    if isinstance(node, ast.BinOp):
        a, b = _const_value(node.left), _const_value(node.right)
        if a is None or b is None:
            return None
        try:
            if isinstance(node.op, ast.Add): return a + b
            if isinstance(node.op, ast.Sub): return a - b
            if isinstance(node.op, ast.Mult): return a * b
            if isinstance(node.op, ast.Div): return a / b
            if isinstance(node.op, ast.Pow): return a ** b
        except (ZeroDivisionError, OverflowError, ValueError):
            return None
    return None


def _is_zero(node: ast.AST) -> bool:
    return _const_value(node) == 0


def _show(node: ast.AST) -> str:
    try:
        return ast.unparse(node)
    except Exception:  # pragma: no cover - defensive
        return "<expression>"


def infer_dimension(source: str, symbol_dims: Mapping[str, Dimension],
                    variables: list[str] | None = None) -> Dimension:
    """Return the dimension of ``source`` or raise :class:`DimensionError`.

    Every variable must be present in ``symbol_dims``; otherwise :class:`MissingUnitError`.
    A literal ``0`` is dimension-agnostic (``x - 0`` is fine for any ``x``).
    """
    text = normalize_expression(source, variables if variables is not None else list(symbol_dims))
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as exc:
        raise UnitError(f"Expression could not be parsed: {source!r}") from exc

    missing: list[str] = []

    def visit(node: ast.AST) -> Dimension | None:
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant):
            return None if node.value == 0 else DIMENSIONLESS
        if isinstance(node, ast.Name):
            if node.id in symbol_dims:
                return symbol_dims[node.id]
            if node.id in CONSTANT_NAMES:
                return DIMENSIONLESS
            if node.id not in missing:
                missing.append(node.id)
            return DIMENSIONLESS
        if isinstance(node, ast.UnaryOp):
            return visit(node.operand)
        if isinstance(node, ast.BinOp):
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, (ast.Add, ast.Sub, ast.Mod)):
                if left is None: return right
                if right is None: return left
                if left != right:
                    verb = "add" if isinstance(node.op, ast.Add) else "subtract" if isinstance(node.op, ast.Sub) else "combine"
                    raise DimensionError(
                        f"Dimensional mismatch: cannot {verb} {left} and {right} in '{_show(node)}'")
                return left
            left = DIMENSIONLESS if left is None else left
            right = DIMENSIONLESS if right is None else right
            if isinstance(node.op, ast.Mult): return left * right
            if isinstance(node.op, ast.Div): return left / right
            if isinstance(node.op, ast.Pow):
                if not right.dimensionless:
                    raise DimensionError(f"Dimensional mismatch: exponent in '{_show(node)}' must be dimensionless, got {right}")
                exp = _const_value(node.right)
                if exp is None:
                    if left.dimensionless:
                        return DIMENSIONLESS
                    raise DimensionError(
                        f"Dimensional mismatch: exponent in '{_show(node)}' must be a numeric constant "
                        f"because the base has dimension {left}")
                return left ** Fraction(exp).limit_denominator(1000)
            raise DimensionError(f"Unsupported operator in '{_show(node)}'")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            name = node.func.id
            if name not in FUNCTION_ARITY:
                raise UnitError(f"Unsupported function '{name}'")
            args = [visit(a) for a in node.args]
            args = [DIMENSIONLESS if a is None else a for a in args]
            if name in _DIMENSIONLESS_FUNCS:
                for a in args:
                    if not a.dimensionless:
                        raise DimensionError(f"Dimensional mismatch: {name}() needs a dimensionless argument, got {a} in '{_show(node)}'")
                return DIMENSIONLESS
            if name in _SAME_DIM_FUNCS:
                return args[0]
            if name == "sqrt": return args[0] ** Fraction(1, 2)
            if name == "cbrt": return args[0] ** Fraction(1, 3)
            if name == "atan2":
                if args[0] != args[1]:
                    raise DimensionError(f"Dimensional mismatch: atan2 arguments must share a dimension in '{_show(node)}'")
                return DIMENSIONLESS
            return DIMENSIONLESS
        raise UnitError(f"Unsupported expression element: {type(node).__name__}")

    result = visit(tree)
    if missing:
        raise MissingUnitError(missing)
    return DIMENSIONLESS if result is None else result


def check_equation_dimensions(equation: str, symbol_dims: Mapping[str, Dimension]) -> Dimension:
    """Both sides of ``lhs = rhs`` must have the same dimension; returns that dimension."""
    lhs, rhs = split_equation(equation, list(symbol_dims))
    dl, dr = infer_dimension(lhs, symbol_dims), infer_dimension(rhs, symbol_dims)
    if rhs.strip() == "0":                   # "expr = 0" carries no information about rhs
        return dl
    if lhs.strip() == "0":
        return dr
    if dl != dr:
        raise DimensionError(f"Dimensional mismatch: left side is {dl} but right side is {dr} in '{equation}'")
    return dl

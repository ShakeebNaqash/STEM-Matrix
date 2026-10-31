"""Restricted-expression definite integration using SymPy.

Expressions are parsed through Python's AST and only a small allow-list of
operators/functions is accepted. Do not replace this with eval().
"""
import ast
import math
import operator

import sympy as sp

from app.schemas.models import SolverRequest, SolverResponse, VerificationResult

BINARY_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
}
UNARY_OPERATORS = {ast.UAdd: operator.pos, ast.USub: operator.neg}
ALLOWED_FUNCTIONS = {
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "exp": sp.exp,
    "log": sp.log,
    "sqrt": sp.sqrt,
}


def parse_expression(expression: str, variable: str):
    if len(expression) > 300:
        raise ValueError("Expression is too long")
    try:
        tree = ast.parse(expression, mode="eval")
    except (SyntaxError, ValueError, MemoryError, RecursionError) as exc:
        raise ValueError("Expression could not be parsed") from exc

    symbol = sp.Symbol(variable)
    node_count = sum(1 for _ in ast.walk(tree))
    if node_count > 100:
        raise ValueError("Expression is too complex")

    def visit(node):
        if isinstance(node, ast.Expression):
            return visit(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise ValueError("Only numeric constants are allowed")
            if isinstance(node.value, float) and not math.isfinite(node.value):
                raise ValueError("Non-finite constants are not allowed")
            return sp.sympify(str(node.value))
        if isinstance(node, ast.Name):
            if node.id == variable:
                return symbol
            raise ValueError(f"Unsupported name: {node.id}")
        if isinstance(node, ast.BinOp):
            operation = BINARY_OPERATORS.get(type(node.op))
            if operation is None:
                raise ValueError("Unsupported arithmetic operator")
            left, right = visit(node.left), visit(node.right)
            if isinstance(node.op, ast.Pow) and right.is_number:
                try:
                    if abs(float(right)) > 20:
                        raise ValueError("Exponent magnitude is limited to 20")
                except (TypeError, ValueError):
                    raise ValueError("Unsupported exponent")
            return operation(left, right)
        if isinstance(node, ast.UnaryOp):
            operation = UNARY_OPERATORS.get(type(node.op))
            if operation is None:
                raise ValueError("Unsupported unary operator")
            return operation(visit(node.operand))
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.keywords:
                raise ValueError("Unsupported function call")
            function = ALLOWED_FUNCTIONS.get(node.func.id)
            if function is None or len(node.args) != 1:
                raise ValueError("Only supported one-argument functions are allowed")
            return function(visit(node.args[0]))
        raise ValueError(f"Unsupported expression element: {type(node).__name__}")

    return visit(tree)


class DefiniteIntegralSolver:
    name = "definite_integral"

    def solve(self, request: SolverRequest) -> SolverResponse:
        try:
            if request.solver != self.name:
                raise ValueError("Request uses the wrong solver")
            if request.lower_bound is None or request.upper_bound is None:
                raise ValueError("Both lower_bound and upper_bound are required")
            if request.lower_bound > request.upper_bound:
                raise ValueError("Lower bound must not exceed upper bound")

            x = sp.Symbol(request.variable)
            expression = parse_expression(request.expression, request.variable)
            result = sp.integrate(expression, (x, request.lower_bound, request.upper_bound))
            if result.has(sp.Integral) or result.is_finite is not True:
                raise ValueError("Could not obtain a finite exact result")

            numeric = float(sp.N(result, 15))
            if not math.isfinite(numeric):
                raise ValueError("Result is not a finite numeric value")

            # This consistency check uses SymPy's antiderivative too; it is a
            # useful sanity check, not an independent proof of correctness.
            antiderivative = sp.integrate(expression, x)
            endpoint_result = (
                antiderivative.subs(x, request.upper_bound)
                - antiderivative.subs(x, request.lower_bound)
            )
            passed = sp.simplify(endpoint_result - result) == 0

            return SolverResponse(
                request_id=request.request_id,
                status="success",
                solver=self.name,
                exact_result=str(result),
                numeric_result=numeric,
                verification=VerificationResult(
                    passed=bool(passed),
                    message="Symbolic consistency check passed" if passed else "Symbolic consistency check failed",
                ),
            )
        except (ValueError, TypeError, SyntaxError, ArithmeticError, OverflowError, RecursionError) as exc:
            return SolverResponse(
                request_id=request.request_id,
                status="failed",
                solver=self.name,
                error=str(exc),
            )
        except Exception as exc:
            # Avoid leaking internals in the API response. Log details in a
            # production deployment; this starter returns a generic message.
            return SolverResponse(
                request_id=request.request_id,
                status="failed",
                solver=self.name,
                error=f"Solver failed ({type(exc).__name__})",
            )

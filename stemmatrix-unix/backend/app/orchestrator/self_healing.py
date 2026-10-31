import math

import sympy as sp

from app.inputs.notation import NotationError, split_number_prefix
from app.inputs.units import UnitError, parse_quantity
from app.solvers.core_math import safe_expr
from app.schemas.models import RepairAttempt, SolveResponse, SolverRequest
from app.solvers.dispatcher import SolverDispatcher
from app.orchestrator.model_client import ModelClient


def parse_numeric_answer(answer: str | None, expected_unit: str | None = None) -> float | None:
    """Parse a model answer: ``9``, ``-3``, ``1.5e-3``, ``9×10^2``, ``1/3``, ``sqrt(2)/2``, ``9 N``.

    If the answer carries a unit it is converted to ``expected_unit``; with no known expected unit,
    or with an incompatible one, the answer is NOT accepted (it cannot be verified).
    """
    if answer is None:
        return None
    text = str(answer).strip()
    if not text:
        return None
    try:
        value, rest = split_number_prefix(text)
        if not rest:
            return value if math.isfinite(value) else None
        if rest[:1] in "/+-*^(" or rest[:2] == "**":           # an expression such as 1/3 or 2*pi
            raise NotationError("expression")
        if expected_unit is None:
            return None
        converted = parse_quantity(f"{value!r} {rest}").to(expected_unit)
        return converted if math.isfinite(converted) else None
    except (NotationError, UnitError):
        pass
    try:                                                      # constant expressions, no variables
        expr = safe_expr(text, [])
        if expr.free_symbols:
            return None
        number = float(sp.N(expr))
        return number if math.isfinite(number) else None
    except (ValueError, TypeError, OverflowError, ArithmeticError):
        return None


def answers_match(model_answer: str | None, solver_value: float, tolerance: float = 1e-8,
                  expected_unit: str | None = None) -> bool:
    value = parse_numeric_answer(model_answer, expected_unit)
    # small absolute slack only: a wrong "0" must not match a tiny but non-zero result
    return value is not None and math.isclose(value, solver_value, rel_tol=tolerance, abs_tol=1e-12)


def describe_request(request: SolverRequest) -> str:
    parts = [f"Operation: {request.solver}"]
    if request.expression:
        parts.append(f"expression: {request.expression} (variable {request.variable})")
    if request.lower_bound is not None or request.upper_bound is not None:
        parts.append(f"bounds: {request.lower_bound} to {request.upper_bound}")
    if request.extra_params:
        parts.append(f"inputs: {request.extra_params}")
    return "; ".join(parts)


class SelfHealingSolver:
    def __init__(self, dispatcher: SolverDispatcher, model_client: ModelClient | None = None, max_attempts: int = 2):
        if max_attempts < 0 or max_attempts > 5:
            raise ValueError("max_attempts must be between 0 and 5")
        self.dispatcher = dispatcher
        self.model_client = model_client
        self.max_attempts = max_attempts

    def solve(self, request: SolverRequest, initial_model_answer: str | None = None,
              question: str | None = None) -> SolveResponse:
        solver_result = self.dispatcher.dispatch(request)
        if solver_result.status != "success" or solver_result.numeric_result is None:
            return SolveResponse(status="failed", solver_result=solver_result, note="Solver did not produce a usable result; it is not labelled verified.")
        if not solver_result.verification or not solver_result.verification.passed:
            return SolveResponse(status="failed", solver_result=solver_result, note="Solver verification did not pass; result is not labelled verified.")

        expected_unit = (solver_result.details or {}).get("unit")
        if not isinstance(expected_unit, str) or "*" in expected_unit and False:
            expected_unit = None
        attempts: list[RepairAttempt] = []
        proposed = initial_model_answer
        for attempt_no in range(self.max_attempts + 1):
            matched = answers_match(proposed, solver_result.numeric_result, expected_unit=expected_unit)
            feedback = None
            if not matched:
                feedback = f"Your answer did not match the deterministic solver result ({solver_result.exact_result}). Recheck your calculation and answer with a numeric value."
            attempts.append(RepairAttempt(
                attempt=attempt_no + 1,
                model_answer=proposed,
                solver_answer=solver_result.exact_result,
                matched=matched,
                feedback=feedback,
            ))
            if matched:
                return SolveResponse(status="verified", solver_result=solver_result, attempts=attempts)
            if attempt_no >= self.max_attempts or self.model_client is None:
                break
            try:
                proposed = self.model_client.answer_problem(
                    question=question or describe_request(request),
                    feedback=feedback,
                )
            except Exception:
                break

        return SolveResponse(
            status="solver_result_unmatched",
            solver_result=solver_result,
            attempts=attempts,
            note="The solver result passed its checks, but the model answer did not match or no model client was available for repair.",
        )

import pytest
from app.schemas.models import SolverRequest
from app.solvers.integration import DefiniteIntegralSolver


def request(expr, lower=0, upper=3):
    return SolverRequest(request_id="test-int", solver="definite_integral", expression=expr, lower_bound=lower, upper_bound=upper)


def test_integrates_x_squared():
    result = DefiniteIntegralSolver().solve(request("x**2"))
    assert result.status == "success"
    assert result.exact_result == "9"
    assert result.numeric_result == pytest.approx(9.0)
    assert result.verification.passed


def test_integrates_constant():
    result = DefiniteIntegralSolver().solve(request("5", 0, 2))
    assert result.status == "success"
    assert result.exact_result == "10"


def test_integrates_sine():
    result = DefiniteIntegralSolver().solve(request("sin(x)", 0, 1))
    assert result.status == "success"
    assert result.numeric_result == pytest.approx(1 - __import__("math").cos(1))


def test_rejects_reversed_bounds():
    result = DefiniteIntegralSolver().solve(request("x**2", 3, 0))
    assert result.status == "failed"
    assert "Lower bound" in result.error


def test_rejects_unsafe_expression():
    result = DefiniteIntegralSolver().solve(request("__import__('os')"))
    assert result.status == "failed"

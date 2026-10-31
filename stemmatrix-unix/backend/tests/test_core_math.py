import math
from app.schemas.models import SolverRequest
from app.solvers.dispatcher import SolverDispatcher


def run(solver, **kwargs):
    payload = {"request_id": "test", "solver": solver, **kwargs}
    return SolverDispatcher().dispatch(SolverRequest(**payload))


def test_arithmetic_and_symbolic_foundations():
    assert run("evaluate", expression="(3/4)+(5/6)").numeric_result == 19 / 12
    assert run("simplify", expression="(x**2 - 1)/(x - 1)").result == "x + 1"
    assert run("factor", expression="x**2 - 5*x + 6").result == "(x - 3)*(x - 2)"


def test_algebra_roots_and_systems():
    result = run("solve_equation", expression="2*x+5=15")
    assert result.status == "success" and result.result == ["5"]
    result = run("polynomial_roots", expression="x**2-5*x+6")
    assert set(result.result) == {"2", "3"}
    result = run("solve_system", equations=["x+y=5", "x-y=1"], variables=["x", "y"])
    assert result.status == "success"
    assert result.result == [{"x": "3", "y": "2"}]


def test_calculus():
    assert run("differentiate", expression="x**3+2*x**2").result == "3*x**2 + 4*x"
    assert run("indefinite_integral", expression="x**2").verification.passed
    result = run("definite_integral", expression="x**2", lower_bound=0, upper_bound=3)
    assert result.numeric_result == 9


def test_linear_algebra():
    result = run("solve_linear_system", matrix=[[1, 1], [1, -1]], vector=[5, 1])
    assert result.status == "success"
    assert result.result == [3.0, 2.0]
    assert result.verification.passed
    assert abs(run("matrix_determinant", matrix=[[1, 2], [3, 4]]).numeric_result + 2) < 1e-12
    assert run("vector_dot", values=[1, 2, 3], extra_params={"vector_b": [4, 5, 6]}).numeric_result == 32


def test_numerical_methods():
    result = run("bisection_root", expression="x**2-2", lower_bound=1, upper_bound=2)
    assert result.status == "success"
    assert abs(result.numeric_result - math.sqrt(2)) < 1e-6
    result = run("simpson_integral", expression="x**2", lower_bound=0, upper_bound=3)
    assert abs(result.numeric_result - 9) < 1e-8
    result = run("interpolate", extra_params={"x_values": [0, 1, 2], "y_values": [1, 3, 5], "at": 3})
    assert abs(result.numeric_result - 7) < 1e-8


def test_statistics_and_probability():
    result = run("descriptive_stats", data=[1, 2, 2, 3, 4])
    assert result.status == "success"
    assert result.result["mean"] == 2.4
    assert result.result["median"] == 2
    assert run("binomial_probability", extra_params={"n": 4, "k": 2, "p": 0.5}).numeric_result == 0.375
    assert abs(run("normal_probability", extra_params={"x": 0, "mean": 0, "standard_deviation": 1}).numeric_result - 0.5) < 1e-12
    assert abs(run("correlation", extra_params={"x_values": [1, 2, 3], "y_values": [2, 4, 6]}).numeric_result - 1) < 1e-12


def test_rejects_unsafe_expression():
    result = run("evaluate", expression="__import__('os').system('echo unsafe')")
    assert result.status == "failed"


def test_equation_solver_accepts_full_equations_and_common_notation():
    # The exact user-reported request must work, not only the expression-only form.
    result = run(
        "solve_equation",
        expression="x**2 - 5*x + 6 = 0",
        variable="x",
    )
    assert result.status == "success"
    assert set(result.result) == {"2", "3"}

    # Common math notation should normalize to the same equation.
    result = run(
        "solve_equation",
        expression="x^2 − 5×x + 6 = 0",
        variable="x",
    )
    assert result.status == "success"
    assert set(result.result) == {"2", "3"}


def test_newton_root_works_with_initial_guess_and_no_bounds():
    result = run(
        "newton_root",
        expression="x**2 - 2",
        variable="x",
        initial_guess=1.5,
        tolerance=1e-8,
        max_iterations=100,
    )
    assert result.status == "success"
    assert abs(result.numeric_result - math.sqrt(2)) < 1e-7
    assert result.details["method"] == "newton"


def test_newton_root_requires_initial_guess_not_bounds():
    result = run("newton_root", expression="x**2 - 2", variable="x")
    assert result.status == "failed"
    assert "initial_guess" in result.error

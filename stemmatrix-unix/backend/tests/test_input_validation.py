import math
import pytest
from app.inputs.dimensions import infer_dimension
from app.inputs.specs import DOMAIN_SPECS, MATH_SPECS, verify_spec
from app.inputs.units import ENERGY, FORCE, LENGTH, MASS, SPEED, DimensionError, parse_unit
from app.schemas.models import SolverRequest
from app.solvers.dispatcher import SolverDispatcher


def run(solver, **kw):
    return SolverDispatcher().dispatch(SolverRequest(request_id="v", solver=solver, **kw))


def cats(r):
    return {i["category"] for i in r.details["preflight"]["issues"]}


def codes(r):
    return {i["code"] for i in r.details["preflight"]["issues"]}


# ---------------- variables --------------------------------------------------
def test_undeclared_variable_is_named_and_distinguished():
    r = run("solve_equation", expression="y + 2 = 5")
    assert r.status == "failed" and "y" in r.error and codes(r) == {"undeclared_variable"}
    ok = run("solve_equation", expression="y + 2 = 5", variable="y")
    assert ok.result == ["3"]
    r = run("differentiate", expression="a*x", variable="x")
    assert "a" in r.error
    assert run("differentiate", expression="a*x", variable="x", variables=["a"]).result == "a"


def test_unknown_function_and_syntax_are_rejected():
    assert "Unsupported function" in run("evaluate", expression="foo(2)").error
    assert run("evaluate", expression="__import__('os')").status == "failed"
    assert run("evaluate", expression="(1).__class__").status == "failed"
    assert "parentheses" in run("evaluate", expression="sin 2").error
    assert "argument" in run("evaluate", expression="sin(1,2)").error


def test_variable_must_appear_when_solving():
    r = run("solve_equation", expression="2 + 2 = 4")
    assert r.status == "failed" and codes(r) == {"variable_not_in_expression"}


def test_bad_variable_names():
    assert run("evaluate", expression="1", variables=["sin"]).status == "failed"
    assert run("evaluate", expression="1", variables=["x y"]).status == "failed"


def test_evaluate_missing_value_vs_invalid():
    r = run("evaluate", expression="2*x")
    assert r.status == "failed" and cats(r) == {"missing"} and codes(r) == {"missing_value"}
    r = run("evaluate", expression="2*x", extra_params={"substitutions": {"x": "abc"}})
    assert r.status == "failed" and cats(r) == {"invalid"}
    assert run("evaluate", expression="2*x", extra_params={"substitutions": {"x": 4}}).numeric_result == 8


# ---------------- missing vs invalid ---------------------------------------
def test_missing_versus_invalid_inputs():
    r = run("physics_force", extra_params={"mass": 10})
    assert cats(r) == {"missing"} and "acceleration" in r.error and "Missing input" in r.error
    r = run("physics_force", extra_params={"mass": -1, "acceleration": 1})
    assert cats(r) == {"invalid"} and "Invalid input" in r.error
    r = run("physics_force", extra_params={"mass": None, "acceleration": 1})
    assert cats(r) == {"missing"}
    r = run("physics_force", extra_params={"mass": "", "acceleration": 1})
    assert cats(r) == {"missing"}
    r = run("physics_force", extra_params={"mass": -1})
    assert cats(r) == {"missing", "invalid"}


@pytest.mark.parametrize("bad", [True, "abc", float("inf"), [1], {"v": 1}])
def test_invalid_types_rejected(bad):
    r = run("physics_force", extra_params={"mass": bad, "acceleration": 1})
    assert r.status == "failed" and "invalid" in cats(r)


def test_physical_constraints():
    assert run("chemistry_ph", extra_params={"concentration": 0}).status == "failed"
    assert run("chemistry_ph", extra_params={"concentration": "1 mmol/L"}).numeric_result == pytest.approx(3)
    assert run("physics_ideal_gas", extra_params={"pressure": 1, "volume": 1, "moles": 1, "temperature": -5}).status == "failed"
    assert run("physics_ideal_gas", extra_params={"pressure": 1, "volume": 1, "moles": 1, "temperature": "-300 °C"}).status == "failed"
    assert run("engineering_reynolds", extra_params={"density": -1, "velocity": 1, "characteristic_length": 1, "dynamic_viscosity": 1}).status == "failed"
    assert run("physics_work", extra_params={"force": 10, "displacement": 2, "angle_degrees": "60 °"}).numeric_result == pytest.approx(10)


def test_numeric_bounds_for_math():
    assert run("binomial_probability", extra_params={"n": 2.5, "k": 1, "p": 0.5}).status == "failed"
    assert run("binomial_probability", extra_params={"n": 4, "k": 5, "p": 0.5}).status == "failed"
    assert run("binomial_probability", extra_params={"n": 4, "k": 2, "p": 1.5}).status == "failed"
    assert run("z_score", extra_params={"value": 1, "mean": 0, "standard_deviation": 0}).status == "failed"
    assert run("percentile", data=[1.0, 2.0], extra_params={"percentile": 101}).status == "failed"
    assert run("bisection_root", expression="x", lower_bound=2, upper_bound=1).status == "failed"
    assert cats(run("bisection_root", expression="x", lower_bound=1)) == {"missing"}
    assert run("variance", data=[1.0], extra_params={"ddof": 1}).status == "failed"
    assert run("sequence_sum", expression="x", extra_params={"start": 5, "stop": 1}).status == "failed"
    assert run("linear_regression", extra_params={"x_values": [1, 1, 1], "y_values": [1, 2, 3]}).status == "failed"
    assert run("physics_kinematics", extra_params={"initial_velocity": 0}).status == "failed"
    assert run("physics_ohms_law", extra_params={"voltage": 1, "current": 1, "resistance": 1}).status == "failed"


# ---------------- dimensional consistency --------------------------------------
def test_adding_mass_to_distance_is_detected():
    r = run("evaluate", expression="m + d", variables=["m", "d"], extra_params={"substitutions": {"m": "5 kg", "d": "3 m"}})
    assert r.status == "failed" and "Dimensional mismatch" in r.error and "mass" in r.error and "length" in r.error
    r = run("simplify", expression="m + d - d", variables=["m", "d"], extra_params={"units": {"m": "kg", "d": "m"}})
    assert r.status == "failed" and codes(r) == {"dimension_mismatch"}       # even though d cancels


def test_equation_sides_must_match():
    r = run("solve_equation", expression="F = m*v", variable="F", variables=["m", "v"],
            extra_params={"units": {"F": "N", "m": "kg", "v": "m/s"}})
    assert r.status == "failed" and "left side" in r.error
    r = run("solve_equation", expression="F = m*a", variable="F", variables=["m", "a"],
            extra_params={"units": {"F": "N", "m": "kg", "a": "m/s^2"}})
    assert r.status == "success" and r.result == ["a*m"]
    assert r.details["preflight"]["dimension"]["equation"].startswith("force")


def test_result_dimension_is_verified():
    kw = dict(expression="m*a", variables=["m", "a"], extra_params={"substitutions": {"m": "2 kg", "a": "3 m/s²"}})
    r = run("evaluate", **kw)
    assert r.numeric_result == 6 and r.details["preflight"]["dimension"]["result"].startswith("force")
    kw["extra_params"] = {**kw["extra_params"], "expected_unit": "N"}
    assert run("evaluate", **kw).status == "success"
    kw["extra_params"]["expected_unit"] = "J"
    r = run("evaluate", **kw)
    assert r.status == "failed" and "expected_unit" in r.error


def test_missing_unit_is_a_missing_input():
    # plain-number substitutions are dimensionless, so m*a is accepted when only m has a unit
    r = run("evaluate", expression="m*a", variables=["m", "a"], extra_params={"units": {"m": "kg"}, "substitutions": {"m": 1, "a": 1}})
    assert r.status == "success"
    r = run("simplify", expression="m*a", variables=["m", "a"], extra_params={"units": {"m": "kg"}})
    assert r.status == "failed" and cats(r) == {"missing"} and codes(r) == {"missing_unit"}


def test_transcendental_functions_need_dimensionless_arguments():
    r = run("simplify", expression="sin(d)", variable="d", extra_params={"units": {"d": "m"}})
    assert r.status == "failed" and "dimensionless" in r.error
    assert run("simplify", expression="exp(d/L)", variable="d", variables=["L"], extra_params={"units": {"d": "m", "L": "m"}}).status == "success"


def test_derivative_and_integral_dimensions():
    r = run("differentiate", expression="s", variable="t", variables=["s"], extra_params={"units": {"s": "m", "t": "s"}, "expected_unit": "m/s"})
    assert r.status == "success"
    r = run("differentiate", expression="s", variable="t", variables=["s"], extra_params={"units": {"s": "m", "t": "s"}, "expected_unit": "m"})
    assert r.status == "failed"


def test_dimension_algebra():
    d = {"m": MASS, "v": SPEED}
    assert infer_dimension("0.5*m*v**2", d) == ENERGY
    assert infer_dimension("sqrt(L)", {"L": LENGTH}) == LENGTH ** __import__("fractions").Fraction(1, 2)
    with pytest.raises(DimensionError):
        infer_dimension("m + v", d)
    with pytest.raises(DimensionError):
        infer_dimension("2**m", d)
    assert infer_dimension("m*a", {"m": MASS, "a": SPEED / parse_unit("s").dim}) == FORCE


def test_every_solver_spec_is_dimensionally_consistent():
    problems = [p for op, spec in {**DOMAIN_SPECS, **MATH_SPECS}.items() for p in verify_spec(op, spec)]
    assert problems == []


# ---------------- numerical residuals ---------------------------------------
def test_numerical_residuals_are_reported():
    r = run("solve_equation", expression="x^3 - 2x - 5 = 0")
    assert r.verification.passed and r.details["symbolic_residuals"]
    r = run("newton_root", expression="x² − 2", initial_guess=1.0)
    assert r.numeric_result == pytest.approx(math.sqrt(2)) and r.details["residual"] < 1e-7
    r = run("solve_system", equations=["x + y = 3", "x − y = 1"], variables=["x", "y"])
    assert r.verification.passed and r.result == [{"x": "2", "y": "1"}]
    r = run("solve_linear_system", matrix=[[2, 1], [1, 3]], vector=[3, 5])
    assert r.details["residual_norm"] < 1e-12
    r = run("matrix_inverse", matrix=[[1, 2], [2, 4.0000000001]])
    assert not r.verification.passed and "ill-conditioned" in r.verification.message


def test_underdetermined_system_is_flagged():
    r = run("solve_system", equations=["x + y = 3"], variables=["x", "y"])
    assert any("underdetermined" in n for n in r.details["preflight"]["notes"])

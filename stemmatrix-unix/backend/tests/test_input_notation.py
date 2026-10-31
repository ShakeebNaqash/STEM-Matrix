import pytest
from app.inputs.notation import (NotationError, normalize_chemical_equation, normalize_chemical_formula,
                                 normalize_expression, parse_plain_number, split_equation, split_number_prefix)
from app.schemas.models import SolverRequest
from app.solvers.dispatcher import SolverDispatcher


def run(solver, **kw):
    return SolverDispatcher().dispatch(SolverRequest(request_id="n", solver=solver, **kw))


@pytest.mark.parametrize("text", ["x²", "x^2", "x**2", "x ^ 2", "x²"])
def test_power_notations_are_equivalent(text):
    assert normalize_expression(text, ["x"]) == "x**2"


@pytest.mark.parametrize("text", ["x² − 5x + 6 = 0", "x^2 - 5x + 6 = 0", "x**2 - 5*x + 6 = 0", "x² − 5·x + 6 ＝ 0", "x^2-5x+6==0"])
def test_equivalent_equations_give_same_solutions(text):
    r = run("solve_equation", expression=text)
    assert r.status == "success" and set(r.result) == {"2", "3"} and r.verification.passed


def test_normalization_is_idempotent():
    for t in ["2x²−5x", "√(x+1)", "πr²", "3xy", "sin(x)cos(x)", "1.5×10⁻³·x", "|x|", "x⁻¹", "log10(x)"]:
        once = normalize_expression(t, ["x", "y", "r"])
        assert normalize_expression(once, ["x", "y", "r"]) == once


def test_multiplication_and_minus_signs():
    assert normalize_expression("3×4÷2−1") == "3*4/2-1"
    assert normalize_expression("a·b", ["a", "b"]) == "a*b"


@pytest.mark.parametrize("text,value", [("1e-5", 1e-5), ("1E−5", 1e-5), ("1.5×10⁻³", 1.5e-3), ("6.022×10^23", 6.022e23),
                                        ("2.5e+3", 2500.0), ("1,000", 1000.0), ("−3", -3.0)])
def test_scientific_notation(text, value):
    assert parse_plain_number(text) == pytest.approx(value)


def test_scientific_notation_in_expressions_is_not_euler():
    assert run("evaluate", expression="1E−5").numeric_result == pytest.approx(1e-5)       # was -2.28 (1*E - 5)
    assert run("evaluate", expression="2.5e3 + 1").numeric_result == pytest.approx(2501)
    assert run("evaluate", expression="1.5×10⁻³").numeric_result == pytest.approx(1.5e-3)


def test_function_and_variable_names_are_preserved():
    assert normalize_expression("log10(x)", ["x"]) == "log10(x)"
    assert normalize_expression("x1 + 1", ["x1"]) == "x1+1"
    assert normalize_expression("arcsin(x)", ["x"]) == "asin(x)"
    assert run("evaluate", expression="log10(1000)").numeric_result == pytest.approx(3)
    r = run("evaluate", expression="x1 + 1", variable="x1", extra_params={"substitutions": {"x1": 2}})
    assert r.numeric_result == 3


def test_square_root_sign_and_abs_bars():
    assert run("evaluate", expression="√16 + |−3|").numeric_result == 7


def test_implicit_multiplication():
    r = run("evaluate", expression="2x(x+1)", extra_params={"substitutions": {"x": 2}})
    assert r.numeric_result == 12
    assert normalize_expression("3xy", ["x", "y"]) == "3*x*y"


def test_equation_boundaries():
    assert split_equation("2x == 4", ["x"]) == ("2*x", "4")
    assert split_equation("x + 1") == ("x+1", "0")
    with pytest.raises(NotationError):
        split_equation("x = 1 = 2")
    with pytest.raises(NotationError):
        split_equation("x < 3")
    with pytest.raises(NotationError):
        split_equation("= 3")


def test_chemical_formulas_are_preserved_not_treated_as_maths():
    assert normalize_chemical_formula("H₂O") == "H2O"
    assert normalize_chemical_formula("CuSO₄·5H₂O") == "CuSO4.5H2O"
    assert normalize_chemical_formula("Co") == "Co" and normalize_chemical_formula("CO") == "CO"
    left, right, notes = normalize_chemical_equation("2H₂(g) + O₂(g) ⇌ 2H₂O(l)")
    assert (left, right) == (["H2", "O2"], ["H2O"])
    for arrow in ["->", "-->", "=>", "→", "⟶", "="]:
        assert normalize_chemical_equation(f"H2 + O2 {arrow} H2O")[1] == ["H2O"]
    with pytest.raises(NotationError):
        normalize_chemical_equation("H2 + O2")


def test_chemistry_solvers_use_shared_notation():
    r = run("chemistry_molar_mass", extra_params={"formula": "KMnO₄"})
    assert r.status == "success" and r.result["molar_mass_g_mol"] == pytest.approx(158.03, abs=0.01)
    r = run("chemistry_molar_mass", extra_params={"formula": "CuSO4·5H2O"})
    assert r.result["molar_mass_g_mol"] == pytest.approx(249.68, abs=0.01)
    r = run("chemistry_balance_equation", extra_params={"equation": "H2(g) + O2(g) => H2O(l)"})
    assert r.result["balanced_equation"] == "2H2 + O2 -> 2H2O"
    r = run("chemistry_balance_equation", extra_params={"equation": "H2 + O2 -> H2O + H2O2"})
    assert r.status == "failed" and "more than one" in r.error


def test_number_prefix_rejects_decimal_comma():
    with pytest.raises(NotationError):
        split_number_prefix("2,5 kg")
    assert split_number_prefix("1,000 g") == (1000.0, "g")

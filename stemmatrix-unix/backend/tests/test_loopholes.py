"""Regression tests for problems found in the solver audit."""
import os
import pytest
from fastapi.testclient import TestClient
from app.api.main import app
from app.orchestrator.model_client import ScriptedMockModelClient
from app.orchestrator.self_healing import SelfHealingSolver, answers_match, parse_numeric_answer
from app.schemas.models import SolverRequest
from app.solvers.dispatcher import SolverDispatcher
from app.solvers.domain_stem import interpret_question
from app.solvers.registry import SolverRegistry


def run(solver, **kw):
    return SolverDispatcher().dispatch(SolverRequest(request_id="l", solver=solver, **kw))


@pytest.mark.parametrize("op,kw", [
    ("limit", dict(expression="x", extra_params={"point": "__import__('os').system('echo pwned > {p}')"})),
    ("taylor_series", dict(expression="x", extra_params={"point": "__import__('os').system('echo pwned > {p}')"})),
    ("interpolate", dict(extra_params={"x_values": [0, 1], "y_values": [0, 1], "at": "__import__('os').system('echo pwned > {p}')"})),
    ("interpolate", dict(extra_params={"x_values": ["__import__('os').system('echo pwned > {p}')", 1], "y_values": [0, 1], "at": 0.5})),
])
def test_no_code_execution_via_sympify(tmp_path, op, kw):
    marker = tmp_path / "pwned"
    payload = str(kw).replace("{p}", str(marker))
    kw = eval(payload)  # noqa: S307 - test-built literal dict only
    r = run(op, **kw)
    assert r.status == "failed" and not marker.exists()


def test_limit_and_series_still_work():
    assert run("limit", expression="sin(x)/x", extra_params={"point": 0}).result == "1"
    assert run("limit", expression="1/x", extra_params={"point": "oo"}).result == "0"
    assert run("limit", expression="sin(x)/x", extra_params={"point": "0", "direction": "+"}).result == "1"
    assert run("taylor_series", expression="exp(x)", degree=2, extra_params={"point": 0}).result.startswith("x**2/2")
    assert run("interpolate", extra_params={"x_values": [0, 1, 2], "y_values": [0, 1, 4], "at": 3}).numeric_result == pytest.approx(9)


def test_undefined_results_are_failures_not_successes():
    for expr in ["1/0", "tan(pi/2)", "log(0)"]:
        r = run("evaluate", expression=expr)
        assert r.status == "failed", expr


def test_resource_limits():
    assert run("evaluate", expression="factorial(300000)").status == "failed"
    assert run("evaluate", expression="((9**99)**99)**9").status == "failed"
    assert run("evaluate", expression="2**100").exact_result == str(2 ** 100)
    assert run("evaluate", expression="1e-300*1e-10").status == "success"


def test_trapezoid_and_simpson_of_constant():
    assert run("trapezoid_integral", expression="5", lower_bound=0, upper_bound=2).numeric_result == pytest.approx(10)
    assert run("simpson_integral", expression="x^2", lower_bound=0, upper_bound=3).numeric_result == pytest.approx(9)


def test_definite_integral_accepts_common_notation_via_preflight():
    r = run("definite_integral", expression="x^2", lower_bound=0, upper_bound=3)
    assert r.status == "success" and r.exact_result == "9"
    r = run("definite_integral", expression="x²", lower_bound=0, upper_bound=3)
    assert r.exact_result == "9"
    assert run("definite_integral", expression="x**2", lower_bound=3, upper_bound=0).status == "failed"
    assert "Lower bound" in run("definite_integral", expression="x**2", lower_bound=3, upper_bound=0).error


def test_every_registered_solver_is_preflighted():
    reg = SolverRegistry()
    for name in reg.names():
        assert type(reg.get(name)).__name__ == "PreflightSolver", name

    class Echo:
        name = "echo"
        seen = None

        def solve(self, request):
            Echo.seen = request
            from app.schemas.models import SolverResponse
            return SolverResponse(request_id=request.request_id, status="success", solver="echo", result="ok")

    custom = SolverRegistry([Echo()])
    assert type(custom.get("echo")).__name__ == "PreflightSolver"


def test_solver_not_called_when_preflight_fails(monkeypatch):
    from app.solvers import domain_stem
    called = []
    monkeypatch.setattr(domain_stem.DomainSTEMSolver, "solve", lambda self, r: called.append(1))
    r = SolverDispatcher().dispatch(SolverRequest(request_id="x", solver="physics_force", extra_params={"mass": "5 m", "acceleration": 1}))
    assert r.status == "failed" and not called


# ---------------- self-healing ------------------------------------------------
def test_answer_matching():
    assert answers_match("9", 9.0) and answers_match("9.0", 9.0) and answers_match("9e0", 9.0)
    assert answers_match("1/3", 1 / 3) and answers_match("sqrt(2)/2", 2 ** 0.5 / 2) and answers_match("−3", -3.0)
    assert not answers_match("0", 1e-9)                 # a wrong zero no longer matches a tiny value
    assert not answers_match("abc", 1.0) and not answers_match(None, 1.0)
    assert not answers_match("__import__('os')", 1.0) and not answers_match("x+1", 1.0)
    assert parse_numeric_answer("9 N") is None                      # unit but nothing to verify against
    assert answers_match("1 kN", 1000.0, expected_unit="N")
    assert not answers_match("1 m", 1000.0, expected_unit="N")      # wrong dimension is never a match


def test_self_healing_uses_the_real_question_not_an_integral_template():
    req = SolverRequest(request_id="s", solver="physics_force", extra_params={"mass": 2, "acceleration": 3})
    mock = ScriptedMockModelClient(["6"])
    res = SelfHealingSolver(SolverDispatcher(), model_client=mock, max_attempts=1).solve(
        req, initial_model_answer="5", question="Force on a 2 kg mass accelerating at 3 m/s^2?")
    assert res.status == "verified"
    assert mock.calls[0]["question"] == "Force on a 2 kg mass accelerating at 3 m/s^2?"
    mock2 = ScriptedMockModelClient(["6"])
    SelfHealingSolver(SolverDispatcher(), model_client=mock2, max_attempts=1).solve(req, initial_model_answer="5")
    assert "physics_force" in mock2.calls[0]["question"] and "integrated" not in mock2.calls[0]["question"]


def test_self_healing_accepts_equivalent_unit_answers():
    req = SolverRequest(request_id="s", solver="physics_force", extra_params={"mass": "2 kg", "acceleration": "3 m/s²"})
    assert SelfHealingSolver(SolverDispatcher()).solve(req, initial_model_answer="0.006 kN").status == "verified"


def test_self_healing_does_not_verify_when_preflight_fails():
    req = SolverRequest(request_id="s", solver="physics_force", extra_params={"mass": "2 m", "acceleration": 3})
    res = SelfHealingSolver(SolverDispatcher()).solve(req, initial_model_answer="6")
    assert res.status == "failed" and "dimension" in res.solver_result.error


# ---------------- interpreter / API ---------------------------------------------
def test_interpreter_keeps_units_and_does_not_crash():
    p = interpret_question("Use Newton second law: mass 500 g and acceleration 2 m/s2, calculate force")
    assert p["solver"] == "physics_force" and p["extra_params"]["mass"] == "500 g"
    assert interpret_question("calculate the reynolds number with density of . velocity of 1 length of 1 viscosity of 1")["status"] == "needs_clarification"
    assert interpret_question("convert 1 MV to V")["extra_params"]["from_unit"] == "MV"      # case preserved
    assert interpret_question("Solve x² − 5x + 6 = 0")["solver"] == "solve_equation"


@pytest.fixture(scope="module")
def client():
    return TestClient(app, raise_server_exceptions=False)


def test_api_interpret_end_to_end(client):
    r = client.post("/api/interpret", json={"question": "Use Newton second law: mass 500 g and acceleration 2 m/s2, calculate force"})
    assert r.status_code == 200 and r.json()["solver_response"]["numeric_result"] == pytest.approx(1.0)
    r = client.post("/api/interpret", json={"question": "Solve x² − 5x + 6 = 0"})
    assert set(r.json()["solver_response"]["result"]) == {"2", "3"}
    r = client.post("/api/interpret", json={"question": "convert 5 kg to m"})
    assert r.json()["solver_response"]["status"] == "failed"


def test_api_dispatch_preflight_errors_are_structured(client):
    r = client.post("/api/solvers/dispatch", json={"request_id": "a", "solver": "physics_force", "extra_params": {"mass": 3}})
    body = r.json()
    assert r.status_code == 200 and body["status"] == "failed"
    assert body["details"]["preflight"]["issues"][0] == {"category": "missing", "code": "missing_input", "field": "acceleration",
                                                         "message": "Required input 'acceleration' is missing (expected acceleration in m/s^2)"}


def test_api_solve_passes_the_question_through(client):
    r = client.post("/api/solve", json={"question": "force?", "model_answer": "6",
                                         "solver_request": {"request_id": "a", "solver": "physics_force", "extra_params": {"mass": 2, "acceleration": 3}}})
    assert r.json()["status"] == "verified"


def test_practice_grading_cannot_be_bypassed_with_huge_tolerance(client):
    assert client.post("/api/practice/grade", json={"question_id": "integral-2", "submitted_value": 0, "tolerance": 1}).status_code == 422
    r = client.post("/api/practice/grade", json={"question_id": "integral-2", "submitted_value": 0, "tolerance": 0.05})
    assert r.json()["correct"] is False
    assert client.post("/api/practice/grade", json={"question_id": "integral-2", "submitted_value": 9}).json()["correct"] is True
    assert client.post("/api/practice/grade", json={"question_id": "nope", "submitted_value": 9}).status_code == 404
    assert client.post("/api/practice/grade", content='{"question_id":"integral-2","submitted_value":NaN}',
                       headers={"content-type": "application/json"}).status_code == 422

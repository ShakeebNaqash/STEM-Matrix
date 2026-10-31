from app.orchestrator.router import QuestionRouter
from app.orchestrator.self_healing import SelfHealingSolver
from app.schemas.models import SolverRequest
from app.solvers.dispatcher import SolverDispatcher


def test_router_selects_problem_solving():
    assert QuestionRouter().route("Integrate x**2 from 0 to 3").mode == "problem_solving"


def test_router_defaults_conceptual_question_to_textbook():
    assert QuestionRouter().route("What is an electric field?").mode == "textbook_qa"


def test_self_healing_marks_matching_answer_verified():
    req = SolverRequest(request_id="a", solver="definite_integral", expression="x**2", lower_bound=0, upper_bound=3)
    result = SelfHealingSolver(SolverDispatcher()).solve(req, initial_model_answer="9")
    assert result.status == "verified"


def test_self_healing_does_not_claim_model_match_when_wrong():
    req = SolverRequest(request_id="b", solver="definite_integral", expression="x**2", lower_bound=0, upper_bound=3)
    result = SelfHealingSolver(SolverDispatcher(), max_attempts=0).solve(req, initial_model_answer="12")
    assert result.status == "solver_result_unmatched"
    assert result.solver_result.exact_result == "9"


def test_self_healing_retries_with_mock_and_verifies_corrected_answer():
    from app.orchestrator.model_client import ScriptedMockModelClient

    req = SolverRequest(
        request_id="repair-1",
        solver="definite_integral",
        expression="x**2",
        lower_bound=0,
        upper_bound=3,
    )
    mock = ScriptedMockModelClient(["9"])
    result = SelfHealingSolver(SolverDispatcher(), model_client=mock, max_attempts=2).solve(
        req, initial_model_answer="8"
    )

    assert result.status == "verified"
    assert len(result.attempts) == 2
    assert result.attempts[0].matched is False
    assert result.attempts[1].matched is True
    assert len(mock.calls) == 1
    assert mock.calls[0]["feedback"] is not None
    assert "9" in mock.calls[0]["feedback"]


def test_self_healing_stops_when_mock_answers_remain_wrong():
    from app.orchestrator.model_client import ScriptedMockModelClient

    req = SolverRequest(
        request_id="repair-2",
        solver="definite_integral",
        expression="x**2",
        lower_bound=0,
        upper_bound=3,
    )
    mock = ScriptedMockModelClient(["7", "8"])
    result = SelfHealingSolver(SolverDispatcher(), model_client=mock, max_attempts=2).solve(
        req, initial_model_answer="6"
    )

    assert result.status == "solver_result_unmatched"
    assert len(result.attempts) == 3  # initial answer + two repair attempts
    assert all(not attempt.matched for attempt in result.attempts)
    assert result.solver_result.exact_result == "9"

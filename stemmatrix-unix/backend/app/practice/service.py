import math
from app.schemas.models import (
    PracticeGenerateRequest, PracticeGradeRequest, PracticeGradeResponse,
    PracticeQuestion, PracticeSet, SolverRequest,
)
from app.solvers.dispatcher import SolverDispatcher


class PracticeService:
    """Small deterministic practice generator for the initial integral solver."""
    TEMPLATES = [
        ("x", 0, 2, "Evaluate the definite integral of x from 0 to 2."),
        ("x**2", 0, 3, "Evaluate the definite integral of x^2 from 0 to 3."),
        ("5", 0, 2, "Evaluate the definite integral of 5 from 0 to 2."),
        ("2*x", 0, 2, "Evaluate the definite integral of 2*x from 0 to 2."),
        ("sin(x)", 0, 1, "Evaluate the definite integral of sin(x) from 0 to 1."),
    ]
    def __init__(self, dispatcher: SolverDispatcher | None = None):
        self.dispatcher = dispatcher or SolverDispatcher()

    def generate(self, request: PracticeGenerateRequest) -> PracticeSet:
        # Fixed, deterministic examples for the first milestone. Replace or
        # expand with corpus-grounded/model-generated questions later.
        questions = []
        for index, (expr, lower, upper, prompt) in enumerate(self.TEMPLATES[:request.count], start=1):
            solver_request = SolverRequest(
                request_id=f"practice-{index}", solver="definite_integral",
                expression=expr, variable="x", lower_bound=lower, upper_bound=upper,
            )
            result = self.dispatcher.dispatch(solver_request)
            if result.status != "success" or result.numeric_result is None:
                continue
            questions.append(PracticeQuestion(
                question_id=f"integral-{index}", prompt=prompt, solver_request=solver_request,
            ))
        return PracticeSet(questions=questions)

    def grade(self, request: PracticeGradeRequest) -> PracticeGradeResponse:
        try:
            index = int(request.question_id.removeprefix("integral-")) - 1
            if index < 0 or index >= len(self.TEMPLATES):
                raise ValueError
            expr, lower, upper, _ = self.TEMPLATES[index]
        except (ValueError, IndexError):
            raise ValueError("Unknown practice question ID")
        solver_request = SolverRequest(
            request_id=f"grade-{request.question_id}", solver="definite_integral",
            expression=expr, variable="x", lower_bound=lower, upper_bound=upper,
        )
        result = self.dispatcher.dispatch(solver_request)
        if result.status != "success" or result.numeric_result is None:
            raise RuntimeError("Could not calculate the answer key")
        expected = result.numeric_result
        correct = math.isclose(
            request.submitted_value, expected,
            rel_tol=request.tolerance, abs_tol=request.tolerance,
        )
        return PracticeGradeResponse(
            correct=correct, expected_value=expected, submitted_value=request.submitted_value,
            feedback="Correct!" if correct else "Not quite. Review the steps and try again.",
        )

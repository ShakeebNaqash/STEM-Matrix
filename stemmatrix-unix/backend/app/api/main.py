import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.schemas.models import (
    PracticeGenerateRequest, PracticeGradeRequest, PracticeGradeResponse,
    PracticeSet, RouteRequest, RouteResponse, SolveRequest, SolveResponse,
    SolverRequest, SolverResponse,
)
from app.orchestrator.router import QuestionRouter
from app.orchestrator.self_healing import SelfHealingSolver
from app.orchestrator.model_client import ScriptedMockModelClient
from app.practice.service import PracticeService
from app.solvers.dispatcher import SolverDispatcher
from app.solvers.domain_stem import interpret_question

app = FastAPI(title="StemMatrix Person B API", version="0.4.0")


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """422 with JSON-safe details (the default handler echoes the raw input, which crashes on NaN/Infinity)."""
    errors = [{"loc": list(e.get("loc", ())), "msg": str(e.get("msg", "")), "type": str(e.get("type", ""))} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


router = QuestionRouter()
dispatcher = SolverDispatcher()

# Default is safely disabled. The scripted mock is for demos/tests only and is
# never presented as a real SLM. A real runtime adapter can be plugged in later.
model_mode = os.getenv("STEMMATRIX_MODEL", "none").strip().lower()
model_client = None
if model_mode == "mock":
    raw_answers = os.getenv("STEMMATRIX_MOCK_ANSWERS", "9")
    scripted_answers = [answer.strip() for answer in raw_answers.split(",") if answer.strip()]
    if scripted_answers:
        model_client = ScriptedMockModelClient(scripted_answers)
    else:
        raise RuntimeError("STEMMATRIX_MOCK_ANSWERS must contain at least one answer")
elif model_mode != "none":
    raise RuntimeError(
        "Unsupported STEMMATRIX_MODEL value. Use 'none' or 'mock' for now; "
        "the real local-model adapter has not been selected yet."
    )

healing_solver = SelfHealingSolver(dispatcher=dispatcher, model_client=model_client, max_attempts=2)
practice_service = PracticeService(dispatcher)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model_configured": model_client is not None,
        "model_mode": model_mode,
        "model_note": (
            "Scripted mock only; not a real SLM"
            if model_mode == "mock"
            else "No model client configured"
        ),
        "solvers": dispatcher.registry.names(),
    }


@app.post("/api/route", response_model=RouteResponse)
def route_question(request: RouteRequest):
    return router.route(request.question)


@app.post("/api/solvers/dispatch", response_model=SolverResponse)
def dispatch_solver(request: SolverRequest):
    return dispatcher.dispatch(request)


@app.post("/api/interpret")
def interpret_natural_language(request: RouteRequest):
    """Map supported natural-language STEM prompts to a deterministic solver request.

    Returns a clarification response when the question is ambiguous or unsupported.
    """
    import uuid
    parsed = interpret_question(request.question)
    if parsed.get("status") == "needs_clarification":
        return parsed
    payload = {"request_id": "nl-" + uuid.uuid4().hex[:12], **parsed}
    payload.pop("confidence", None)
    try:
        solver_request = SolverRequest(**payload)
    except Exception as exc:
        return {"status": "needs_clarification", "message": f"Could not form a valid solver request: {exc}", "interpretation": parsed}
    response = dispatcher.dispatch(solver_request)
    return {"interpretation": parsed, "solver_response": response.model_dump()}


@app.post("/api/solve", response_model=SolveResponse)
def solve(request: SolveRequest):
    return healing_solver.solve(request.solver_request, initial_model_answer=request.model_answer, question=request.question)


@app.post("/api/practice", response_model=PracticeSet)
def generate_practice(request: PracticeGenerateRequest):
    return practice_service.generate(request)


@app.post("/api/practice/grade", response_model=PracticeGradeResponse)
def grade_practice(request: PracticeGradeRequest):
    try:
        return practice_service.grade(request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

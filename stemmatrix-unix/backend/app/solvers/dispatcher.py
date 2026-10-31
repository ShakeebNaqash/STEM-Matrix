from app.schemas.models import SolverRequest, SolverResponse
from app.solvers.registry import SolverRegistry


class SolverDispatcher:
    def __init__(self, registry: SolverRegistry | None = None):
        self.registry = registry or SolverRegistry()

    def dispatch(self, request: SolverRequest) -> SolverResponse:
        try:
            solver = self.registry.get(request.solver)
        except ValueError as exc:
            return SolverResponse(
                request_id=request.request_id,
                status="failed",
                solver=request.solver,
                error=str(exc),
            )
        return solver.solve(request)

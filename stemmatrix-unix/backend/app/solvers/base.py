from typing import Protocol
from app.schemas.models import SolverRequest, SolverResponse


class Solver(Protocol):
    name: str

    def solve(self, request: SolverRequest) -> SolverResponse:
        """Run a supported deterministic calculation."""
        ...

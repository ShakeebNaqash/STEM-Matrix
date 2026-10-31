from app.inputs.preflight import PreflightSolver
from app.solvers.base import Solver
from app.solvers.core_math import CoreMathSolver
from app.solvers.integration import DefiniteIntegralSolver
from app.solvers.domain_stem import DomainSTEMSolver


class SolverRegistry:
    """Maps public operation names to solver implementations."""
    def __init__(self, solvers: list[Solver] | None = None):
        self._solvers: dict[str, Solver] = {}
        if solvers is not None:
            for solver in solvers:
                self.register(solver)
        else:
            self.register(DefiniteIntegralSolver())
            domain = DomainSTEMSolver()
            for operation in sorted(domain.operations):
                self.register_alias(operation, domain)
            core = CoreMathSolver()
            for operation in sorted(core.operations):
                self.register_alias(operation, core)

    def register(self, solver: Solver) -> None:
        self.register_alias(solver.name, solver)

    def register_alias(self, name: str, solver: Solver) -> None:
        if name in self._solvers:
            raise ValueError(f"Solver already registered: {name}")
        # Every solver is wrapped so its input always passes through the shared preflight.
        self._solvers[name] = solver if isinstance(solver, PreflightSolver) else PreflightSolver(solver)

    def get(self, name: str) -> Solver:
        try:
            return self._solvers[name]
        except KeyError as exc:
            raise ValueError(f"Unsupported solver: {name}") from exc

    def names(self) -> list[str]:
        return sorted(self._solvers)

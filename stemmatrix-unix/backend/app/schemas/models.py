from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
import math

# Solver names are validated by the registry at execution time so new solver
# capabilities can be added without editing this schema for every operation.
SolverName = Literal['definite_integral', 'evaluate', 'arithmetic', 'simplify', 'expand', 'factor', 'fraction_simplify', 'percentage', 'gcd_lcm', 'convert_number_base', 'solve_equation', 'solve_system', 'polynomial_roots', 'partial_fraction', 'sequence_sum', 'binomial_expansion', 'differentiate', 'partial_differentiate', 'indefinite_integral', 'limit', 'taylor_series', 'matrix_add', 'matrix_multiply', 'matrix_transpose', 'matrix_determinant', 'matrix_inverse', 'matrix_rank', 'matrix_eigenvalues', 'solve_linear_system', 'vector_dot', 'vector_cross', 'vector_norm', 'numerical_root', 'bisection_root', 'newton_root', 'numerical_integral', 'trapezoid_integral', 'simpson_integral', 'interpolate', 'linear_regression', 'descriptive_stats', 'mean', 'median', 'mode', 'variance', 'standard_deviation', 'z_score', 'normal_probability', 'binomial_probability', 'correlation', 'percentile', 'unit_convert', 'physics_kinematics', 'physics_force', 'physics_weight', 'physics_kinetic_energy', 'physics_potential_energy', 'physics_momentum', 'physics_density', 'physics_pressure', 'physics_ohms_law', 'physics_electrical_power', 'physics_wave_speed', 'physics_ideal_gas', 'physics_work', 'physics_hydrostatic_pressure', 'physics_heat_energy', 'chemistry_molar_mass', 'chemistry_molarity', 'chemistry_dilution', 'chemistry_ideal_gas', 'chemistry_ph', 'chemistry_balance_equation', 'chemistry_stoichiometry', 'engineering_reynolds', 'engineering_heat_transfer', 'engineering_efficiency', 'engineering_voltage_divider', 'engineering_bending_stress', 'engineering_flow_rate', 'engineering_safety_factor']
QuestionMode = Literal["textbook_qa", "problem_solving", "out_of_scope"]


class SolverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    request_id: str = Field(min_length=1, max_length=100)
    solver: SolverName
    # General-purpose structured input. Existing integration request fields remain
    # supported for backwards compatibility.
    expression: str | None = Field(default=None, min_length=1, max_length=1000)
    variable: str = Field(default="x", pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$")
    lower_bound: int | float | None = None
    upper_bound: int | float | None = None
    equations: list[str] | None = Field(default=None, max_length=30)
    variables: list[str] | None = Field(default=None, max_length=20)
    matrix: list[list[float]] | None = Field(default=None, max_length=50)
    vector: list[float] | None = Field(default=None, max_length=50)
    values: list[float] | None = Field(default=None, max_length=10000)
    data: list[float] | None = Field(default=None, max_length=10000)
    target: str | None = Field(default=None, max_length=80)
    method: str | None = Field(default=None, max_length=40)
    initial_guess: float | None = None
    tolerance: float = Field(default=1e-8, gt=0, le=0.1)
    max_iterations: int = Field(default=100, ge=1, le=10000)
    degree: int | None = Field(default=None, ge=1, le=20)
    probabilities: list[float] | None = Field(default=None, max_length=1000)
    weights: list[float] | None = Field(default=None, max_length=10000)
    extra_params: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def finite_numeric_inputs(self):
        for name in ("lower_bound", "upper_bound", "initial_guess", "tolerance"):
            value = getattr(self, name)
            if value is not None and not math.isfinite(float(value)):
                raise ValueError(f"{name} must be finite")
        for name in ("matrix", "vector", "values", "data", "weights", "probabilities"):
            values = getattr(self, name)
            if values is not None:
                flattened = [v for row in values for v in row] if name == "matrix" else values
                if any(not math.isfinite(float(v)) for v in flattened):
                    raise ValueError(f"{name} must contain only finite numbers")
        return self


class VerificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    passed: bool
    message: str


class SolverResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str
    status: Literal["success", "failed"]
    solver: str
    exact_result: str | None = None
    numeric_result: float | None = None
    result: Any | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    verification: VerificationResult | None = None
    error: str | None = None


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)


class RouteResponse(BaseModel):
    mode: QuestionMode
    reason: str


class SolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    solver_request: SolverRequest
    model_answer: str | None = None


class RepairAttempt(BaseModel):
    attempt: int
    model_answer: str | None
    solver_answer: str | None
    matched: bool
    feedback: str | None = None


class SolveResponse(BaseModel):
    status: Literal["verified", "solver_result_unmatched", "failed"]
    solver_result: SolverResponse
    attempts: list[RepairAttempt] = Field(default_factory=list)
    note: str | None = None


class PracticeGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: Literal["definite_integral"] = "definite_integral"
    count: int = Field(default=3, ge=1, le=10)


class PracticeQuestion(BaseModel):
    question_id: str
    prompt: str
    solver_request: SolverRequest


class PracticeSet(BaseModel):
    questions: list[PracticeQuestion]


class PracticeGradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str = Field(min_length=1)
    submitted_value: float = Field(allow_inf_nan=False)
    # Capped: a tolerance near 1 would accept almost any answer as "correct".
    tolerance: float = Field(default=1e-6, ge=0, le=0.05, allow_inf_nan=False)


class PracticeGradeResponse(BaseModel):
    correct: bool
    expected_value: float
    submitted_value: float
    feedback: str

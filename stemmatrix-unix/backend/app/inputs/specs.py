"""Per-operation input specifications for the preflight layer.

Plain numbers are interpreted in the unit listed here (SI unless noted), exactly as the
solvers always did; quantities with units are converted into it.  The ``formula`` /
``equations`` / ``alternatives`` entries are checked for dimensional consistency by the
test-suite (and can be re-checked at runtime with :func:`verify_spec`).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from app.inputs.constraints import Issue, ParamSpec, invalid, missing
from app.inputs.dimensions import infer_dimension
from app.inputs.units import (ACCELERATION, DIMENSIONLESS, ENERGY, FORCE, LENGTH, MOMENTUM, POWER,
                              PRESSURE, SPEED, TIME, Dimension, parse_unit)

Rule = Callable[[dict[str, Any], dict[str, Any], list[Issue]], None]   # (values, raw_extra, issues)


@dataclass(frozen=True)
class OpSpec:
    params: tuple[ParamSpec, ...] = ()
    top_required: tuple[str, ...] = ()               # SolverRequest fields that must be present
    output_unit: str | None = None                   # unit of a scalar result
    formula: str | None = None                       # dimension of this formula must equal output_unit
    equations: tuple[tuple[str, str], ...] = ()      # both sides must have equal dimension
    alternatives: tuple[tuple[str, str, str], ...] = ()   # (target, formula, unit) for multi-target ops
    rules: tuple[Rule, ...] = ()
    same_units: tuple[tuple[str, ...], ...] = ()     # if one is given with a unit, all must be
    description: str = ""


def N(name, unit=None, **kw) -> ParamSpec:          # noqa: N802 - terse constructor
    return ParamSpec(name, "number", unit, **kw)


def I(name, **kw) -> ParamSpec:                       # noqa: E743
    return ParamSpec(name, "integer", None, **kw)


def L(name, **kw) -> ParamSpec:
    return ParamSpec(name, "number_list", None, **kw)


POS = {"min": 0, "min_open": True}
NONNEG = {"min": 0}
OPT = {"required": False}


def _provided(values: dict[str, Any], names: tuple[str, ...]) -> list[str]:
    return [n for n in names if values.get(n) is not None]


def _rule_ohm(values, raw, issues):
    given = _provided(values, ("voltage", "current", "resistance"))
    if len(given) < 2:
        issues.append(missing("voltage/current/resistance", "Provide exactly two of voltage, current, resistance"))
    elif len(given) == 3:
        issues.append(invalid("voltage/current/resistance", "Provide exactly two of voltage, current, resistance; "
                                                          "all three were given", "overspecified"))


def _rule_power(values, raw, issues):
    given = _provided(values, ("voltage", "current", "resistance"))
    if len(given) < 2:
        issues.append(missing("voltage/current/resistance",
                              "Provide voltage and current, current and resistance, or voltage and resistance"))
    elif len(given) == 3:
        v, i, r = values["voltage"], values["current"], values["resistance"]
        if abs(v - i * r) > 1e-6 * max(1.0, abs(v), abs(i * r)):
            issues.append(invalid("voltage/current/resistance",
                                  f"voltage ({v:g}) does not equal current*resistance ({i * r:g}); inputs are inconsistent",
                                  "inconsistent_inputs"))


_KIN = ("initial_velocity", "final_velocity", "acceleration", "time", "displacement")


def _rule_kinematics(values, raw, issues):
    given = _provided(values, _KIN)
    if len(given) < 3:
        issues.append(missing("kinematics", "Provide at least three of initial_velocity, final_velocity, "
                                            "acceleration, time, displacement"))
    elif len(given) == len(_KIN):
        issues.append(invalid("kinematics", "All five kinematics quantities were given; omit the one to solve for",
                              "overspecified"))
    target = raw.get("target")
    if target is not None and target not in _KIN:
        issues.append(invalid("target", f"target must be one of {', '.join(_KIN)}", "invalid_choice"))
    if target in _KIN and values.get(target) is not None:
        issues.append(invalid("target", f"target '{target}' was also supplied as an input", "overspecified"))


KINEMATICS_ALT = (
    ("final_velocity", "initial_velocity+acceleration*time", "m/s"),
    ("initial_velocity", "final_velocity-acceleration*time", "m/s"),
    ("acceleration", "(final_velocity-initial_velocity)/time", "m/s^2"),
    ("time", "(final_velocity-initial_velocity)/acceleration", "s"),
    ("displacement", "initial_velocity*time+0.5*acceleration*time**2", "m"),
)

G = N("gravity", "m/s^2", required=False, **POS, constraint="gravitational acceleration is positive")

DOMAIN_SPECS: dict[str, OpSpec] = {
    # ------------------------------------------------------------------ physics
    "physics_force": OpSpec(
        (N("mass", "kg", **POS, constraint="mass is positive"), N("acceleration", "m/s^2")),
        output_unit="N", formula="mass*acceleration"),
    "physics_weight": OpSpec(
        (N("mass", "kg", **POS, constraint="mass is positive"), G),
        output_unit="N", formula="mass*gravity"),
    "physics_kinetic_energy": OpSpec(
        (N("mass", "kg", **POS, constraint="mass is positive"), N("velocity", "m/s")),
        output_unit="J", formula="0.5*mass*velocity**2"),
    "physics_momentum": OpSpec(
        (N("mass", "kg", **POS, constraint="mass is positive"), N("velocity", "m/s")),
        output_unit="kg*m/s", formula="mass*velocity"),
    "physics_potential_energy": OpSpec(
        (N("mass", "kg", **POS, constraint="mass is positive"), N("height", "m"), G),
        output_unit="J", formula="mass*gravity*height"),
    "physics_density": OpSpec(
        (N("mass", "kg", **NONNEG, constraint="mass cannot be negative"),
         N("volume", "m^3", **POS, constraint="volume is positive")),
        output_unit="kg/m^3", formula="mass/volume"),
    "physics_pressure": OpSpec(
        (N("force", "N"), N("area", "m^2", **POS, constraint="area is positive")),
        output_unit="Pa", formula="force/area"),
    "physics_ohms_law": OpSpec(
        (N("voltage", "V", required=False), N("current", "A", required=False),
         N("resistance", "ohm", required=False, **NONNEG, constraint="resistance cannot be negative")),
        alternatives=(("voltage", "current*resistance", "V"), ("current", "voltage/resistance", "A"),
                      ("resistance", "voltage/current", "ohm")),
        rules=(_rule_ohm,)),
    "physics_electrical_power": OpSpec(
        (N("voltage", "V", required=False), N("current", "A", required=False),
         N("resistance", "ohm", required=False, **NONNEG, constraint="resistance cannot be negative")),
        output_unit="W",
        alternatives=(("P=VI", "voltage*current", "W"), ("P=I2R", "current**2*resistance", "W"),
                      ("P=V2/R", "voltage**2/resistance", "W")),
        rules=(_rule_power,)),
    "physics_wave_speed": OpSpec(
        (N("frequency", "Hz", **POS, constraint="frequency is positive"),
         N("wavelength", "m", **POS, constraint="wavelength is positive")),
        output_unit="m/s", formula="frequency*wavelength"),
    "physics_ideal_gas": OpSpec(
        (N("pressure", "Pa", **NONNEG, constraint="absolute pressure cannot be negative"),
         N("volume", "m^3", **POS, constraint="volume is positive"),
         N("moles", "mol", **POS, constraint="amount of substance is positive"),
         N("temperature", "K", **POS, constraint="absolute temperature is positive"),
         N("gas_constant", "J/(mol*K)", required=False, **POS)),
        equations=(("pressure*volume", "moles*gas_constant*temperature"),)),
    "physics_work": OpSpec(
        (N("force", "N"), N("displacement", "m"), N("angle_degrees", "deg", required=False)),
        output_unit="J", formula="force*displacement"),
    "physics_hydrostatic_pressure": OpSpec(
        (N("density", "kg/m^3", **POS, constraint="density is positive"),
         N("depth", "m", **NONNEG, constraint="depth cannot be negative"), G),
        output_unit="Pa", formula="density*gravity*depth"),
    "physics_heat_energy": OpSpec(
        (N("mass", "kg", **POS, constraint="mass is positive"),
         N("specific_heat", "J/(kg*K)", **POS, constraint="specific heat is positive"),
         N("temperature_change", "K", temperature="delta")),
        output_unit="J", formula="mass*specific_heat*temperature_change"),
    "physics_kinematics": OpSpec(
        (N("initial_velocity", "m/s", required=False), N("final_velocity", "m/s", required=False),
         N("acceleration", "m/s^2", required=False),
         N("time", "s", required=False, **NONNEG, constraint="time cannot be negative"),
         N("displacement", "m", required=False)),
        alternatives=KINEMATICS_ALT, rules=(_rule_kinematics,)),
    # ---------------------------------------------------------------- chemistry
    "chemistry_molarity": OpSpec(
        (N("moles", "mol", **NONNEG, constraint="amount of substance cannot be negative"),
         N("volume_liters", "L", **POS, constraint="volume is positive")),
        output_unit="mol/L", formula="moles/volume_liters"),
    "chemistry_dilution": OpSpec(
        (N("initial_concentration", "mol/L", **NONNEG, constraint="concentration cannot be negative"),
         N("initial_volume", "L", **NONNEG, constraint="volume cannot be negative"),
         N("final_volume", "L", **POS, constraint="volume is positive")),
        output_unit="mol/L", formula="initial_concentration*initial_volume/final_volume"),
    "chemistry_ideal_gas": OpSpec(
        (N("pressure", "atm", **NONNEG, constraint="absolute pressure cannot be negative"),
         N("volume", "L", **POS, constraint="volume is positive"),
         N("temperature", "K", **POS, constraint="absolute temperature is positive"),
         N("gas_constant", "L*atm/(mol*K)", required=False, **POS)),
        output_unit="mol", formula="pressure*volume/(gas_constant*temperature)"),
    "chemistry_ph": OpSpec(
        (N("concentration", "mol/L", **POS, constraint="[H+] must be positive"),),
        formula=None),
    "chemistry_stoichiometry": OpSpec(
        (N("given_moles", "mol", **NONNEG, constraint="amount cannot be negative"),
         N("given_coefficient", **POS), N("target_coefficient", **POS)),
        output_unit="mol", formula="given_moles*target_coefficient/given_coefficient"),
    # -------------------------------------------------------------- engineering
    "engineering_reynolds": OpSpec(
        (N("density", "kg/m^3", **POS, constraint="density is positive"), N("velocity", "m/s"),
         N("characteristic_length", "m", **POS, constraint="length is positive"),
         N("dynamic_viscosity", "Pa*s", **POS, constraint="viscosity is positive")),
        output_unit="1", formula="density*velocity*characteristic_length/dynamic_viscosity"),
    "engineering_heat_transfer": OpSpec(
        (N("heat_transfer_coefficient", "W/(m^2*K)", **NONNEG),
         N("area", "m^2", **NONNEG, constraint="area cannot be negative"),
         N("temperature_difference", "K", temperature="delta")),
        output_unit="W", formula="heat_transfer_coefficient*area*temperature_difference"),
    "engineering_efficiency": OpSpec(
        (N("useful_output", **NONNEG, constraint="useful output cannot be negative"),
         N("total_input", **POS, constraint="input is positive")),
        output_unit="1"),
    "engineering_voltage_divider": OpSpec(
        (N("input_voltage", "V"), N("r1", "ohm", **NONNEG), N("r2", "ohm", **NONNEG)),
        output_unit="V", formula="input_voltage*r2/(r1+r2)"),
    "engineering_bending_stress": OpSpec(
        (N("bending_moment", "N*m"), N("second_moment_area", "m^4", **POS, constraint="second moment of area is positive"),
         N("distance_from_neutral_axis", "m")),
        output_unit="Pa", formula="bending_moment*distance_from_neutral_axis/second_moment_area"),
    "engineering_flow_rate": OpSpec(
        (N("area", "m^2", **NONNEG, constraint="area cannot be negative"), N("average_velocity", "m/s")),
        output_unit="m^3/s", formula="area*average_velocity"),
    "engineering_safety_factor": OpSpec(
        (N("failure_strength", "Pa", **POS), N("working_stress", "Pa", **POS)),
        output_unit="1", formula="failure_strength/working_stress",
        same_units=(("failure_strength", "working_stress"),)),
}

# --------------------------------------------------------------------------- #
# Core mathematics: which request fields / extra_params each operation needs
# --------------------------------------------------------------------------- #
def _rule_sequence(values, raw, issues):
    start, stop = values.get("start", 1), values.get("stop", 10)
    if start > stop:
        issues.append(invalid("start/stop", f"start ({start}) must not exceed stop ({stop})", "out_of_range"))
    elif stop - start > 100_000:
        issues.append(invalid("start/stop", "Sequence range is too large (limit 100000 terms)", "out_of_range"))


def _rule_regression(values, raw, issues):
    xs, ys = values.get("x_values"), values.get("y_values")
    if xs is None or ys is None:
        return
    if len(xs) != len(ys):
        issues.append(invalid("x_values/y_values", f"x_values ({len(xs)}) and y_values ({len(ys)}) must have equal length", "length_mismatch"))
    elif len(set(xs)) < 2:
        issues.append(invalid("x_values", "x_values are all identical, so a regression/correlation is undefined", "degenerate_data"))


def _rule_interpolate(values, raw, issues):
    xs, ys = values.get("x_values"), values.get("y_values")
    if xs is not None and ys is not None and len(xs) != len(ys):
        issues.append(invalid("x_values/y_values", f"x_values ({len(xs)}) and y_values ({len(ys)}) must have equal length", "length_mismatch"))


MATH_SPECS: dict[str, OpSpec] = {
    "percentage": OpSpec((N("value"), N("percent"))),
    "gcd_lcm": OpSpec((L("integers", min_len=1),)),
    "convert_number_base": OpSpec((ParamSpec("value", "text", required=True),
                                   I("base", required=False, min=2, max=36), I("source_base", required=False, min=2, max=36))),
    "sequence_sum": OpSpec((I("start", required=False), I("stop", required=False)), top_required=("expression",), rules=(_rule_sequence,)),
    "interpolate": OpSpec((L("x_values", min_len=2, distinct=True), L("y_values", min_len=2), N("at")), rules=(_rule_interpolate,)),
    "linear_regression": OpSpec((L("x_values", min_len=2), L("y_values", min_len=2)), rules=(_rule_regression,)),
    "correlation": OpSpec((L("x_values", min_len=2), L("y_values", min_len=2)), rules=(_rule_regression,)),
    "z_score": OpSpec((N("value"), N("mean"), N("standard_deviation", **POS, constraint="standard deviation is positive"))),
    "normal_probability": OpSpec((N("mean", required=False), N("standard_deviation", required=False, **POS,
                                                               constraint="standard deviation is positive"),
                                  N("x", required=False), N("lower", required=False), N("upper", required=False))),
    "binomial_probability": OpSpec((I("n", min=0, max=10_000_000), I("k", min=0), N("p", min=0, max=1))),
    "percentile": OpSpec((N("percentile", required=False, min=0, max=100),)),
    "variance": OpSpec((I("ddof", required=False, min=0),)),
    "standard_deviation": OpSpec((I("ddof", required=False, min=0),)),
    "matrix_add": OpSpec((ParamSpec("matrix_b", "matrix"),), top_required=("matrix",)),
    "matrix_multiply": OpSpec((ParamSpec("matrix_b", "matrix"),), top_required=("matrix",)),
    "matrix_transpose": OpSpec(top_required=("matrix",)),
    "matrix_determinant": OpSpec(top_required=("matrix",)),
    "matrix_inverse": OpSpec(top_required=("matrix",)),
    "matrix_rank": OpSpec(top_required=("matrix",)),
    "matrix_eigenvalues": OpSpec(top_required=("matrix",)),
    "solve_linear_system": OpSpec(top_required=("matrix", "vector")),
    "vector_dot": OpSpec((L("vector_b", min_len=1),), top_required=("values",)),
    "vector_cross": OpSpec((L("vector_b", min_len=3),), top_required=("values",)),
    "vector_norm": OpSpec(top_required=("values",)),
    "trapezoid_integral": OpSpec((I("n", required=False, min=2, max=1_000_000),), top_required=("lower_bound", "upper_bound")),
    "simpson_integral": OpSpec((I("n", required=False, min=2, max=1_000_000),), top_required=("lower_bound", "upper_bound")),
    "numerical_integral": OpSpec(top_required=("lower_bound", "upper_bound")),
    "definite_integral": OpSpec(top_required=("lower_bound", "upper_bound")),
    "bisection_root": OpSpec(top_required=("lower_bound", "upper_bound")),
    "numerical_root": OpSpec(),
    "newton_root": OpSpec(top_required=("initial_guess",)),
    "binomial_expansion": OpSpec(top_required=("degree",)),
}
for _stat in ("descriptive_stats", "mean", "median", "mode"):
    MATH_SPECS[_stat] = OpSpec()
EXPRESSION_OPS = frozenset({
    "evaluate", "arithmetic", "simplify", "expand", "factor", "fraction_simplify", "solve_equation",
    "polynomial_roots", "partial_fraction", "sequence_sum", "binomial_expansion", "differentiate",
    "partial_differentiate", "indefinite_integral", "limit", "taylor_series", "numerical_root",
    "bisection_root", "newton_root", "numerical_integral", "trapezoid_integral", "simpson_integral",
    "definite_integral",
})
EQUATION_OPS = frozenset({"solve_equation"})
VARIABLE_MUST_APPEAR = frozenset({"solve_equation", "polynomial_roots", "numerical_root", "bisection_root", "newton_root"})
# result dimension relative to the expression: "same", "per_var" (divide by var), "times_var"
RESULT_RELATION = {
    "evaluate": "same", "arithmetic": "same", "simplify": "same", "expand": "same", "factor": "same",
    "fraction_simplify": "same", "partial_fraction": "same", "differentiate": "per_var",
    "partial_differentiate": "per_target", "indefinite_integral": "times_var", "definite_integral": "times_var",
    "numerical_integral": "times_var", "trapezoid_integral": "times_var", "simpson_integral": "times_var",
}
DEFINITE_INTEGRAL_FUNCTIONS = frozenset({"sin", "cos", "tan", "exp", "log", "sqrt"})


def get_spec(op: str) -> OpSpec | None:
    return DOMAIN_SPECS.get(op) or MATH_SPECS.get(op)


def verify_spec(op: str, spec: OpSpec) -> list[str]:
    """Return dimensional problems found in a spec's formulas (empty list = consistent)."""
    problems: list[str] = []
    dims = {p.name: p.dim for p in spec.params}
    if spec.formula and spec.output_unit:
        try:
            got, want = infer_dimension(spec.formula, dims), parse_unit(spec.output_unit).dim if spec.output_unit != "1" else DIMENSIONLESS
            if got != want:
                problems.append(f"{op}: formula {spec.formula!r} has dimension {got}, output unit {spec.output_unit!r} is {want}")
        except Exception as exc:                                   # noqa: BLE001
            problems.append(f"{op}: {exc}")
    for lhs, rhs in spec.equations:
        try:
            a, b = infer_dimension(lhs, dims), infer_dimension(rhs, dims)
            if a != b:
                problems.append(f"{op}: {lhs!r} ({a}) != {rhs!r} ({b})")
        except Exception as exc:                                   # noqa: BLE001
            problems.append(f"{op}: {exc}")
    for target, formula, unit in spec.alternatives:
        try:
            got, want = infer_dimension(formula, dims), parse_unit(unit).dim
            if got != want:
                problems.append(f"{op}/{target}: {formula!r} has dimension {got}, expected {want}")
        except Exception as exc:                                   # noqa: BLE001
            problems.append(f"{op}/{target}: {exc}")
    return problems

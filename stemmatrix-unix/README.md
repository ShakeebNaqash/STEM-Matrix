# StemMatrix — Person B STEM solver engine (Unix/Linux)

This project is the Person B backend slice for StemMatrix: solver dispatch, core mathematics, the existing bounded self-healing coordinator, and basic practice mode. It runs without an SLM. A scripted mock model can demonstrate retry behavior but is **not** a real language model.

## What is implemented

The solver API now includes the existing `definite_integral` operation plus a registry-backed core mathematics catalogue:

- **Foundations / arithmetic:** `evaluate`, `arithmetic`, `percentage`, `gcd_lcm`, `convert_number_base`.
- **Symbolic manipulation:** `simplify`, `expand`, `factor`, `fraction_simplify`.
- **Algebra:** `solve_equation`, `solve_system`, `polynomial_roots`, `partial_fraction`, `sequence_sum`, `binomial_expansion`.
- **Calculus:** `differentiate`, `partial_differentiate`, `indefinite_integral`, `definite_integral`, `limit`, `taylor_series`.
- **Linear algebra / vectors:** `matrix_add`, `matrix_multiply`, `matrix_transpose`, `matrix_determinant`, `matrix_inverse`, `matrix_rank`, `matrix_eigenvalues`, `solve_linear_system`, `vector_dot`, `vector_cross`, `vector_norm`.
- **Numerical methods:** `numerical_root`, `bisection_root`, `newton_root`, `numerical_integral`, `trapezoid_integral`, `simpson_integral`, `interpolate`, `linear_regression`.
- **Statistics / probability:** `descriptive_stats`, `mean`, `median`, `mode`, `variance`, `standard_deviation`, `percentile`, `z_score`, `normal_probability`, `binomial_probability`, `correlation`.

This is an expanded STEM catalogue, not a guarantee of every possible formula or phrasing. The project now includes documented physics, chemistry, engineering, unit conversion, and a conservative natural-language interpretation endpoint. Unsupported or ambiguous language should return a clarification request rather than silently guessing. Scientific formulas still require correct, consistent units and assumptions; see the Extended STEM solvers section below.

## Requirements and setup (Ubuntu/Debian)

Python 3.10 or newer is required. NumPy, SciPy, and SymPy are used for numerical and symbolic calculations.

```bash
sudo apt update
sudo apt install python3-venv python3-pip unzip
cd ~/Downloads
unzip stemmatrix-unix-core-math.zip
cd stemmatrix-unix/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Tests

```bash
python -m pytest -v
```

The test suite covers API/schema/orchestrator/practice behavior, core math, domain solvers, units, and natural-language templates. Passing tests do not establish that every scientific edge case or every possible natural-language formulation is supported.

## Start the API

```bash
uvicorn app.api.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs`. The `/api/health` response lists all registered solver names.

## Example requests

All examples use `POST /api/solvers/dispatch`.

### 1. Solve an equation

```json
{
  "request_id": "algebra-1",
  "solver": "solve_equation",
  "expression": "2*x+5=15",
  "variable": "x"
}
```

### 2. Differentiate

```json
{
  "request_id": "calc-1",
  "solver": "differentiate",
  "expression": "x**3+2*x**2",
  "variable": "x"
}
```

### 3. Solve a linear system

```json
{
  "request_id": "linear-system-1",
  "solver": "solve_linear_system",
  "matrix": [[1, 1], [1, -1]],
  "vector": [5, 1]
}
```

### 4. Numerical root using bisection

```json
{
  "request_id": "root-1",
  "solver": "bisection_root",
  "expression": "x**2-2",
  "variable": "x",
  "lower_bound": 1,
  "upper_bound": 2,
  "tolerance": 1e-8,
  "max_iterations": 100
}
```

### 5. Descriptive statistics

```json
{
  "request_id": "stats-1",
  "solver": "descriptive_stats",
  "data": [1, 2, 2, 3, 4]
}
```

### 6. Normal probability P(X < x)

```json
{
  "request_id": "prob-1",
  "solver": "normal_probability",
  "extra_params": {
    "x": 70,
    "mean": 65,
    "standard_deviation": 5,
    "side": "less"
  }
}
```

### Matrix operations

Matrix operations use `matrix` for the first matrix and `extra_params.matrix_b` for the second matrix in `matrix_add` and `matrix_multiply`. Vector operations use `values` for the first vector and `extra_params.vector_b` for the second vector.

### Additional parameters

Some operations use `extra_params`, for example:

- `percentage`: `{"value": 80, "percent": 15}`
- `gcd_lcm`: `{"integers": [12, 18, 30]}`
- `convert_number_base`: `{"value": "FF", "source_base": 16, "base": 2}`
- `limit`: `{"point": 0, "direction": "+-"}`
- `taylor_series`: `{"point": 0}` and `degree: 5`
- `numerical_integral`: lower/upper bounds and expression
- `trapezoid_integral` / `simpson_integral`: optional `extra_params.n` subinterval count
- `interpolate`: `{"x_values": [0, 1, 2], "y_values": [1, 3, 5], "at": 3}`
- `linear_regression` / `correlation`: paired `x_values` and `y_values`
- `z_score`: `{"value": 70, "mean": 65, "standard_deviation": 5}`
- `binomial_probability`: `{"n": 4, "k": 2, "p": 0.5}`

## Existing self-healing demonstration

The mock is a scripted sequence of answers, not an SLM. From `backend/`:

```bash
STEMMATRIX_MODEL=mock STEMMATRIX_MOCK_ANSWERS=9 uvicorn app.api.main:app --reload --host 127.0.0.1 --port 8000
```

Then submit an intentionally wrong initial answer (`8`) for the definite integral of `x**2` from 0 to 3 to `POST /api/solve`. The mock returns `9` on its repair call. To demonstrate retry exhaustion, restart the server with `STEMMATRIX_MOCK_ANSWERS=8,8`.

Use no model client by starting the server without these environment variables.

## Existing endpoints

- `GET /api/health`
- `POST /api/route`
- `POST /api/solvers/dispatch`
- `POST /api/solve`
- `POST /api/practice`
- `POST /api/practice/grade`

## Important engineering notes / limitations

- Solver names are validated by the request schema and mapped through the registry. The natural-language router remains a keyword-based baseline; it does not yet transform arbitrary user prose into validated structured solver requests.
- Expression parsing uses an AST allow-list and never Python `eval()`. Still, symbolic and numerical operations should run with timeouts, memory/process limits, and rate limits when exposed to untrusted users.
- Floating-point calculations have numerical error. A verification result describes the checks actually performed; it is not a universal proof of mathematical correctness.
- Some operations require well-formed structured `extra_params`; consult the examples and test suite.
- Practice mode currently generates and grades definite-integral exercises only.
- The mock client is not a real SLM. A local Ollama or llama.cpp adapter must be implemented once the team selects a model runtime.
- The starter should be reconciled with the team's main repository before merging.

## Extended STEM solvers (Core STEM Edition)

This edition adds deterministic physics, chemistry, engineering, unit-conversion, and conservative natural-language interpretation endpoints. It does **not** claim that every possible natural-language phrasing or scientific formula is supported; ambiguous prompts return a clarification response rather than silently guessing. Engineering outputs are educational calculations, not certified safety/design decisions.

### Natural-language endpoint

`POST /api/interpret` accepts `{ "question": "..." }`, maps a supported template to a registered solver, executes it, and returns both the interpretation and solver response. Examples:

```json
{"question":"Use Newton second law: mass 10 kg and acceleration 2 m/s2, calculate force"}
```

```json
{"question":"Molar mass of H2O"}
```

```json
{"question":"Balance chemical equation H2 + O2 -> H2O"}
```

Unsupported or ambiguous prompts return `status: needs_clarification`. The template interpreter is intentionally conservative and is not an LLM; arbitrary word problems need more parser/model integration and confidence checks.

### Unit conversion

Solver `unit_convert`, with value and source/target units in `extra_params`:

```json
{"request_id":"units-1","solver":"unit_convert","extra_params":{"value":100,"from_unit":"km/h","to_unit":"m/s"}}
```

Conversions check that source and target units have the same physical dimension (see *Shared input layer* below). Compound units (`m/s²`, `kg·m/s^2`, `J/(kg·K)`, `mol/L`) are parsed; SI prefixes are case-sensitive (`mV` ≠ `MV`, `mm` ≠ `Mm`, `M` = mol/L, not metres).

### Physics operations

All values below go under `extra_params`:

| Solver | Required parameters | Example formula / convention |
|---|---|---|
| `physics_kinematics` | a sufficient subset of `initial_velocity`, `final_velocity`, `acceleration`, `time`, `displacement`; optional `target` | Constant-acceleration equations |
| `physics_force` | `mass`, `acceleration` | F = ma; kg, m/s² |
| `physics_weight` | `mass`; optional `gravity` | W = mg |
| `physics_kinetic_energy` | `mass`, `velocity` | KE = ½mv² |
| `physics_potential_energy` | `mass`, `height`; optional `gravity` | PE = mgh |
| `physics_momentum` | `mass`, `velocity` | p = mv |
| `physics_density` | `mass`, `volume` | ρ = m/V |
| `physics_pressure` | `force`, `area` | P = F/A |
| `physics_ohms_law` | exactly two of `voltage`, `current`, `resistance` | V = IR |
| `physics_electrical_power` | any valid pair among voltage/current/resistance | P = VI, I²R, or V²/R |
| `physics_wave_speed` | `frequency`, `wavelength` | v = fλ |
| `physics_ideal_gas` | `pressure`, `volume`, `moles`, `temperature` | Checks PV = nRT residual; SI units |
| `physics_work` | `force`, `displacement`; optional `angle_degrees` | W = Fs cos θ |
| `physics_hydrostatic_pressure` | `density`, `depth`; optional `gravity` | p = ρgh |
| `physics_heat_energy` | `mass`, `specific_heat`, `temperature_change` | Q = mcΔT |

Example:

```json
{"request_id":"force-1","solver":"physics_force","extra_params":{"mass":10,"acceleration":2}}
```

### Chemistry operations

| Solver | Required parameters | Notes |
|---|---|---|
| `chemistry_molar_mass` | `formula`, e.g. `H2O` | Uses the common-element atomic-weight subset; unsupported elements are rejected, not guessed |
| `chemistry_molarity` | `moles`, `volume_liters` | M = n/V |
| `chemistry_dilution` | `initial_concentration`, `initial_volume`, `final_volume` | C₁V₁ = C₂V₂; consistent volume units |
| `chemistry_ideal_gas` | `pressure`, `volume`, `temperature` | L, atm, K; returns amount in mol |
| `chemistry_ph` | `concentration` | −log₁₀[H⁺], strong-acid approximation |
| `chemistry_balance_equation` | `equation`, e.g. `H2 + O2 -> H2O` | Balances supported formula notation by integer nullspace |
| `chemistry_stoichiometry` | `given_moles`, `given_coefficient`, `target_coefficient` | Assumes a balanced equation and does not itself find the limiting reagent |

Example:

```json
{"request_id":"balance-1","solver":"chemistry_balance_equation","extra_params":{"equation":"H2 + O2 -> H2O"}}
```

### Engineering operations

| Solver | Required parameters | Formula / assumptions |
|---|---|---|
| `engineering_reynolds` | `density`, `velocity`, `characteristic_length`, `dynamic_viscosity` | Re = ρvL/μ; SI units |
| `engineering_heat_transfer` | `heat_transfer_coefficient`, `area`, `temperature_difference` | Q̇ = hAΔT |
| `engineering_efficiency` | `useful_output`, `total_input` | Output/input × 100%; flags values above 100% |
| `engineering_voltage_divider` | `input_voltage`, `r1`, `r2` | Ideal unloaded divider |
| `engineering_bending_stress` | `bending_moment`, `second_moment_area`, `distance_from_neutral_axis` | σ = My/I; linear-elastic beam assumption |
| `engineering_flow_rate` | `area`, `average_velocity` | Q = Av |
| `engineering_safety_factor` | `failure_strength`, `working_stress` | Strength/stress; matching units required |

### Verification improvements and limits

- Symbolic equation and polynomial-root operations now record substitution residuals and do not mark an empty solution list as verified.
- Numerical root finding reports the function residual and fails verification if it exceeds the configured threshold.
- The ideal-gas physics operation reports absolute and relative equation residuals.
- Unit conversions reject cross-dimension conversions (for example kg to m).
- Domain solvers check many positivity, division-by-zero, finiteness, and physical-range constraints, and expose formula/assumption metadata.
- These checks are operation-specific. They are not a universal theorem prover, full unit-aware type system, uncertainty-propagation engine, or safety certification. Inputs for formulas must use consistent units as documented. Unsupported chemistry elements/formulas and ambiguous natural language are rejected instead of silently approximated.

Run regression tests from `backend/`:

```bash
python -m pytest -v
```


## Shared input layer (`app/inputs`)

**Every** solver request now passes through one preflight before any calculation (`SolverRegistry` wraps every registered solver, so the dispatcher, self-healing coordinator, practice mode and `/api/interpret` are all covered). If anything cannot be interpreted safely the solver is not called and a `status: "failed"` response is returned with a readable `error` and machine-readable `details.preflight.issues` (`category` is `missing` or `invalid`, plus `code`, `field`, `message`).

| Module | Purpose |
|---|---|
| `notation.py` | `x²`, `x^2`, `x**2`, `x⁻¹`; `×`, `·`, `÷`, Unicode minus; `1e-5`, `1E−5`, `1.5×10⁻³`; `√x`, `|x|`, `π`, implicit multiplication (`2x(x+1)`, `3xy`); preserves function names (`log10`), variable names (`x1`), chemical formulas (`H₂O`, `CuSO₄·5H₂O`) and equation/arrow boundaries. Idempotent. |
| `units.py` | Quantity parser (`500 g`, `2 m/s²`, `25 °C`, `1.5×10⁻³ kg`), dimension vectors, exact-fraction conversion, affine °C/°F. Incompatible dimensions raise instead of computing. |
| `dimensions.py` | Dimensional analysis of expressions/equations from the syntax tree (`m + d - d` is still rejected). |
| `constraints.py` / `specs.py` | Required inputs, numeric bounds, physical constraints and the unit each solver expects, per operation. |
| `preflight.py` | Orchestrates the above; `PreflightSolver` wrapper. |

Behaviour notes
- **Plain numbers keep their old meaning** (already in the solver's unit, SI unless stated), so existing requests are unchanged. Quantities may be strings (`"500 g"`) or `{"value": 500, "unit": "g"}` and are converted, e.g. `physics_force` with `mass: "500 g"`, `acceleration: "2 m/s²"` gives 1 N.
- Temperatures: absolute inputs (`temperature` of the gas laws) convert with offsets (`0 °C` → 273.15 K); intervals (`temperature_change`, `temperature_difference`, `°C` inside `J/(kg·°C)`) do not.
- Math requests can opt into dimensional checking via `extra_params`: `units` (`{"m":"kg","a":"m/s^2"}`), `substitutions` (numbers or quantities, used by `evaluate`), and `expected_unit` (checked against the inferred result dimension; for physics/chemistry/engineering operations the numeric result is also converted into it, see `details.preflight.converted_result`).
- Undeclared variables, unknown functions, missing values (`missing_value`), missing units (`missing_unit`) and invalid ones are reported separately. `solve_system` notes under/over-determined systems.
- Lower-case or oddly-cased units that are not an exact SI spelling (`mv`, `Kg`) are accepted only when unambiguous and the reading is reported in `details.preflight.notes`.

Limits: the unit table is a documented subset; there is still no per-request time limit, so deploy behind process/resource limits as noted above.

## Audit fixes (v0.4.0)

- **Code execution via `sympify`**: string values for `limit`/`taylor_series` `point` and `interpolate` inputs were `eval`-ed by SymPy; they are now parsed by the restricted parser.
- `1E-5`/`1e-5` evaluated wrongly (`1*E-5`) or failed; `log10(x)`, `x1` variables broke under the old regex normaliser.
- `1/0`, `tan(pi/2)`, `log(0)` returned "success" (`zoo`); `factorial(300000)` and nested huge powers could exhaust resources; limits added.
- Unit table was case-insensitive (`MV`→mV, `Mm`→mm, `M`→metre): silent 10⁶–10⁹ errors.
- Silent wrong answers: negative mass accepted, booleans as numbers, `binomial n=2.7` truncated, constant-x regression, stop<start sums, `ddof ≥ n` (NaN), near-singular inverse reported as verified, inconsistent V/I/R power inputs, ambiguous chemical balancing, `trapezoid_integral` of a constant failed.
- Chemistry: many common elements (Mn, Cr, Ni, Sn, Au, …) were missing; hydrates, subscripts and state symbols now handled.
- Practice grading: `tolerance=1` marked any answer correct (cap now 0.05; NaN/Inf rejected); unknown question id returned 500 (now 404).
- Self-healing: repair prompts always described an integral and ignored the `question`; model answers like `9 N`, `1/3`, `9×10^0` are now understood; a wrong `0` no longer matches tiny values.
- `/api/interpret` crashed (500) on malformed numbers and lower-cased away unit case.
- Known design caveat (unchanged): self-healing feedback includes the solver's answer, so a model can simply copy it.

Run `./run_tests.sh` (126 tests: 36 original + 90 for the input layer and the fixes above).

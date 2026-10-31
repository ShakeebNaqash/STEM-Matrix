import pytest
from app.inputs.units import (ACCELERATION, FORCE, MASS, DimensionError, UnitError, convert, parse_quantity, parse_unit)
from app.schemas.models import SolverRequest
from app.solvers.dispatcher import SolverDispatcher


def run(solver, **kw):
    return SolverDispatcher().dispatch(SolverRequest(request_id="u", solver=solver, **kw))


@pytest.mark.parametrize("text,dim,si", [
    ("500 g", MASS, 0.5), ("500g", MASS, 0.5), ("2 m/s²", ACCELERATION, 2), ("2 m/s^2", ACCELERATION, 2),
    ("2 m/s**2", ACCELERATION, 2), ("9.81 m s^-2", ACCELERATION, 9.81), ("1 kg*m/s^2", FORCE, 1), ("1 N", FORCE, 1),
    ("1.5×10⁻³ kg", MASS, 1.5e-3), ("1 lb", MASS, 0.45359237)])
def test_parse_quantity(text, dim, si):
    q = parse_quantity(text)
    assert q.dimension == dim and q.to_si() == pytest.approx(si)


def test_temperatures():
    assert parse_quantity("25 °C").to_si() == pytest.approx(298.15)
    assert parse_quantity("25°C").to_si() == pytest.approx(298.15)
    assert parse_quantity("98.6 °F").to_si() == pytest.approx(310.15)
    assert convert(100, "°C", "°F") == pytest.approx(212)
    assert convert(-40, "°C", "°F") == pytest.approx(-40)
    assert convert(25, "°C", "K", delta=True) == pytest.approx(25)       # an interval, not a point
    # inside a compound unit the degree is an interval
    assert parse_quantity("1 cal/(g·°C)").to("J/(kg*K)") == pytest.approx(4184)


def test_si_prefix_case_is_respected():
    assert convert(1, "MV", "V") == 1e6 and convert(1, "mV", "V") == 1e-3
    assert convert(1, "Mm", "m") == 1e6 and convert(1, "mm", "m") == 1e-3
    assert convert(1, "mv", "V") == pytest.approx(1e-3)        # lower-case prefix means milli
    notes = []
    parse_unit("Kg", notes=notes)
    assert notes and "kg" in notes[0]                           # non-exact readings are reported


def test_molar_is_not_meter():
    assert convert(1, "M", "mol/m^3") == 1000
    with pytest.raises(DimensionError):
        convert(1, "M", "m")


def test_incompatible_dimensions_are_rejected():
    with pytest.raises(DimensionError, match="Incompatible units"):
        convert(1, "kg", "m")
    with pytest.raises(UnitError):
        parse_unit("furlongs")


def test_unit_convert_solver_and_legacy_names():
    assert run("unit_convert", extra_params={"value": 100, "from_unit": "km/h", "to_unit": "m/s"}).result["value"] == pytest.approx(27.7778, abs=1e-3)
    assert run("unit_convert", extra_params={"value": 0, "from_unit": "celsius", "to_unit": "fahrenheit"}).result["value"] == pytest.approx(32)
    assert run("unit_convert", extra_params={"value": 1, "from_unit": "MV", "to_unit": "V"}).result["value"] == 1e6
    r = run("unit_convert", extra_params={"value": "100 km/h", "to_unit": "m/s"})
    assert r.status == "success"
    r = run("unit_convert", extra_params={"value": 1, "from_unit": "kg", "to_unit": "m"})
    assert r.status == "failed" and "Incompatible units" in r.error
    r = run("unit_convert", extra_params={"value": 1, "from_unit": "kg"})
    assert r.status == "failed" and r.details["preflight"]["issues"][0]["category"] == "missing"


def test_quantities_are_converted_to_solver_units():
    r = run("physics_force", extra_params={"mass": "500 g", "acceleration": "2 m/s²"})
    assert r.status == "success" and r.numeric_result == pytest.approx(1.0)
    assert r.details["preflight"]["conversions"][0]["field"] == "mass"
    r = run("physics_force", extra_params={"mass": {"value": 2, "unit": "lb"}, "acceleration": 1})
    assert r.numeric_result == pytest.approx(0.90718474)
    r = run("physics_ideal_gas", extra_params={"pressure": "1 atm", "volume": "22.41396954 L", "moles": 1, "temperature": "0 °C"})
    assert r.status == "success" and r.verification.passed                      # 0 °C -> 273.15 K


def test_temperature_change_is_an_interval():
    r = run("physics_heat_energy", extra_params={"mass": "1 kg", "specific_heat": "4.184 kJ/(kg·K)", "temperature_change": "25 °C"})
    assert r.numeric_result == pytest.approx(104600)            # NOT 25 °C -> 298 K


def test_incompatible_quantity_is_rejected_not_computed():
    r = run("physics_force", extra_params={"mass": "5 m", "acceleration": 2})
    assert r.status == "failed" and "dimension" in r.error and r.details["preflight"]["issues"][0]["code"] == "dimension_mismatch"
    r = run("physics_force", extra_params={"mass": 5, "acceleration": "2 kg"})
    assert r.status == "failed"
    r = run("physics_force", extra_params={"mass": "5 furlongs", "acceleration": 2})
    assert r.status == "failed" and "Unsupported unit" in r.error


def test_expected_unit_converts_result_and_checks_dimension():
    r = run("physics_force", extra_params={"mass": 1000, "acceleration": 1, "expected_unit": "kN"})
    assert r.details["preflight"]["converted_result"] == {"value": pytest.approx(1.0), "unit": "kN"}
    r = run("physics_force", extra_params={"mass": 1, "acceleration": 1, "expected_unit": "J"})
    assert r.status == "failed" and "expected_unit" in r.error


def test_mixed_unit_and_plain_ratio_is_rejected():
    r = run("engineering_safety_factor", extra_params={"failure_strength": "300 MPa", "working_stress": 100})
    assert r.status == "failed"
    r = run("engineering_safety_factor", extra_params={"failure_strength": "300 MPa", "working_stress": "100 MPa"})
    assert r.numeric_result == pytest.approx(3)

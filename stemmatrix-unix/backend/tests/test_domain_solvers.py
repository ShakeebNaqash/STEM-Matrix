import math
from app.schemas.models import SolverRequest
from app.solvers.dispatcher import SolverDispatcher
from app.solvers.domain_stem import interpret_question, convert_units


def run(solver, **kwargs):
    return SolverDispatcher().dispatch(SolverRequest(request_id='domain-test', solver=solver, **kwargs))


def test_physics_force_energy_and_ohms_law():
    assert run('physics_force', extra_params={'mass': 10, 'acceleration': 2}).numeric_result == 20
    assert run('physics_kinetic_energy', extra_params={'mass': 2, 'velocity': 3}).numeric_result == 9
    r = run('physics_ohms_law', extra_params={'voltage': 12, 'resistance': 4})
    assert r.status == 'success' and r.result['value'] == 3


def test_unit_conversions_and_dimension_validation():
    assert abs(convert_units(100, 'km/h', 'm/s')['value'] - 27.7777777778) < 1e-8
    assert abs(convert_units(0, 'celsius', 'fahrenheit')['value'] - 32) < 1e-9
    r = run('unit_convert', extra_params={'value': 1, 'from_unit': 'kg', 'to_unit': 'm'})
    assert r.status == 'failed' and 'Incompatible units' in r.error


def test_chemistry_molar_mass_and_balancing():
    r = run('chemistry_molar_mass', extra_params={'formula': 'H2O'})
    assert r.status == 'success' and abs(r.result['molar_mass_g_mol'] - 18.015) < .01
    r = run('chemistry_balance_equation', extra_params={'equation': 'H2 + O2 -> H2O'})
    assert r.status == 'success'
    assert r.result['balanced_equation'] == '2H2 + O2 -> 2H2O'


def test_chemistry_concentration_and_ph():
    assert run('chemistry_molarity', extra_params={'moles': .5, 'volume_liters': 2}).numeric_result == .25
    assert abs(run('chemistry_ph', extra_params={'concentration': 1e-3}).numeric_result - 3) < 1e-12


def test_engineering_calculations_and_constraints():
    r=run('engineering_reynolds', extra_params={'density': 1000, 'velocity': 1, 'characteristic_length': .1, 'dynamic_viscosity': .001})
    assert r.status == 'success' and r.numeric_result == 100000
    r=run('engineering_voltage_divider', extra_params={'input_voltage': 12, 'r1': 1000, 'r2': 1000})
    assert r.numeric_result == 6
    r=run('engineering_safety_factor', extra_params={'failure_strength': 300, 'working_stress': 100})
    assert r.numeric_result == 3
    assert run('engineering_reynolds', extra_params={'density': -1, 'velocity': 1, 'characteristic_length': 1, 'dynamic_viscosity': 1}).status == 'failed'


def test_natural_language_interpreter_supported_and_unsupported_prompts():
    p=interpret_question('Use Newton second law: mass 10 kg and acceleration 2 m/s2, calculate force')
    assert p['solver'] == 'physics_force'
    p=interpret_question('Molar mass of H2O')
    assert p['solver'] == 'chemistry_molar_mass' and p['extra_params']['formula'] == 'H2O'
    p=interpret_question('What is the weather?')
    assert p['status'] == 'needs_clarification'


def test_new_math_notation_normalization():
    r=run('solve_equation', expression='x² − 5x + 6 = 0', variable='x')
    assert r.status == 'success' and set(r.result) == {'2','3'}


def test_expression_parser_common_notation_and_functions():
    assert run('evaluate', expression='sqrt(9) + 2x', variable='x', extra_params={}).status == 'failed'  # evaluate requires a bound x
    r=run('evaluate', expression='sqrt(9) + 2*3')
    assert r.status == 'success' and r.numeric_result == 9


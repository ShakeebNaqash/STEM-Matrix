import pytest
from pydantic import ValidationError
from app.schemas.models import SolverRequest


def test_valid_request_defaults_variable():
    request = SolverRequest(request_id="test-1", solver="definite_integral", expression="x**2", lower_bound=0, upper_bound=3)
    assert request.variable == "x"


def test_rejects_unknown_solver():
    with pytest.raises(ValidationError):
        SolverRequest(request_id="test-2", solver="made_up", expression="x", lower_bound=0, upper_bound=1)


def test_rejects_extra_fields():
    with pytest.raises(ValidationError):
        SolverRequest(request_id="test-3", solver="definite_integral", expression="x", lower_bound=0, upper_bound=1, command="bad")


def test_rejects_non_numeric_bound():
    with pytest.raises(ValidationError):
        SolverRequest(request_id="test-4", solver="definite_integral", expression="x", lower_bound="zero", upper_bound=1)

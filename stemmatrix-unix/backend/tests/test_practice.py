from app.practice.service import PracticeService
from app.schemas.models import PracticeGenerateRequest, PracticeGradeRequest


def test_generates_practice_questions():
    result = PracticeService().generate(PracticeGenerateRequest(count=2))
    assert len(result.questions) == 2


def test_grades_correct_answer():
    result = PracticeService().grade(PracticeGradeRequest(question_id="integral-1", submitted_value=2.0))
    assert result.correct


def test_grades_wrong_answer():
    result = PracticeService().grade(PracticeGradeRequest(question_id="integral-1", submitted_value=3.0))
    assert not result.correct

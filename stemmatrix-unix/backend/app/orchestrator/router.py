import re
from app.schemas.models import RouteResponse


class QuestionRouter:
    """Small transparent baseline router; replace/refine during evaluation."""
    OUT_OF_SCOPE_HINTS = ("football", "cricket score", "weather today", "celebrity gossip")
    SOLVER_HINTS = (
        "integrate", "integral", "differentiate", "derivative", "eigenvalue",
        "eigenvalues", "matrix determinant", "calculate", "solve the equation",
    )

    def route(self, question: str) -> RouteResponse:
        normalized = question.lower().strip()
        if any(hint in normalized for hint in self.OUT_OF_SCOPE_HINTS):
            return RouteResponse(mode="out_of_scope", reason="Question appears outside the supported STEM scope")
        if any(hint in normalized for hint in self.SOLVER_HINTS):
            return RouteResponse(mode="problem_solving", reason="Question contains a supported calculation cue")
        # This is a baseline assumption, not semantic understanding. A future
        # classifier/model should improve ambiguous and unsupported cases.
        return RouteResponse(mode="textbook_qa", reason="Default route for conceptual or formula questions")

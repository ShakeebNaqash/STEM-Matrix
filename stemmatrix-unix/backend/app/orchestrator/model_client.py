"""Model-client contract and a deterministic development-only mock.

A real Ollama or llama.cpp adapter can implement ModelClient later without
changing the solver or self-healing coordinator.
"""
from typing import Protocol, Sequence


class ModelClient(Protocol):
    def answer_problem(self, question: str, feedback: str | None = None) -> str:
        """Return a proposed numeric answer for a problem."""
        ...


class NoModelConfigured:
    """Explicit placeholder used when no model runtime is configured."""

    def answer_problem(self, question: str, feedback: str | None = None) -> str:
        raise RuntimeError(
            "No SLM client is configured. Inject a ModelClient to enable repair attempts."
        )


class ScriptedMockModelClient:
    """Deterministic mock for local demos and tests; NOT an actual language model.

    Each call returns the next configured answer. It is useful for demonstrating
    retries before the team chooses Ollama, llama.cpp, or another runtime.
    """

    def __init__(self, answers: Sequence[str] = ("9",)) -> None:
        if not answers:
            raise ValueError("At least one scripted mock answer is required")
        self._answers = list(answers)
        self._index = 0
        self.calls: list[dict[str, str | None]] = []

    def answer_problem(self, question: str, feedback: str | None = None) -> str:
        self.calls.append({"question": question, "feedback": feedback})
        if self._index >= len(self._answers):
            raise RuntimeError("Scripted mock has no more answers configured")
        answer = self._answers[self._index]
        self._index += 1
        return answer

# Files to request

## Backend teammate (must-have)
- `backend/app/schemas/`: actual `SolverRequest`, solver response, chat request/event Pydantic models.
- `backend/app/solvers/`: dispatcher/registry and solver entry point.
- `backend/app/inputs/`: preflight validation, unit/notation normalization, dimensional checks, error models.
- `backend/app/orchestrator/model_client.py`: ModelClient interface.
- `backend/app/orchestrator/router.py` and `self_healing.py`: orchestration contracts.
- `backend/requirements.txt` or `pyproject.toml`, test command, representative tests.
- Sanitized examples for derivative, definite/indefinite integral, roots, eigenvalues, unit-aware solve, and conceptual question.

Items schemas+solvers+inputs are essential for aligned `SolverRequest` dataset generation and gold answers. Never create a duplicate schema.

## Frontend teammate (metadata contract only)
- TypeScript types for SSE `meta`, `segment`, `attempt`, `done` events and source objects.
- Expected `/api/books` and `/api/sources` response shapes.
- Provenance labels and fields (`chunkId`, `sourceType`, etc.).
- Sample mock JSON for chat/books/sources/flashcards/feedback.
- `next.config.ts` only if you are also debugging proxy/build.

Frontend teammate owns removing mock routes, FastAPI rewrite/proxy, SSE handling, health/error type alignment. You do not need frontend components for corpus ingestion or QLoRA.

# StemMatrix API contract

The Next.js app calls these paths on its own server. When a route is live, that server calls the same path on FastAPI. JSON on the wire is snake_case. The browser only sees the camelCase types in `lib/types.ts`.

Routes the backend already serves: `GET /api/health`, `POST /api/practice`, `POST /api/practice/grade`.

Routes still needed: `POST /api/chat`, `GET /api/books`, `GET /api/sources/{chunk_id}`, `GET /api/flashcards`, `POST /api/feedback`.

## Health

`GET /api/health`

Already implemented. Response:

```json
{
  "status": "ok",
  "model_configured": false,
  "model_mode": "none",
  "model_note": "No model client configured",
  "solvers": ["definite_integral"]
}
```

`model_mode` is `"none"`, `"mock"`, or the name of a connected runtime. `model_configured: false` means no model. `"mock"` means the scripted stand-in.

## Practice

`POST /api/practice`

Already implemented. The UI sends a practice set, and the live route only calls this when the set includes numeric questions. Body:

```json
{ "topic": "definite_integral", "count": 5 }
```

Response:

```json
{
  "questions": [
    {
      "question_id": "integral-2",
      "prompt": "Evaluate the definite integral of x^2 from 0 to 3.",
      "solver_request": { "request_id": "practice-2", "solver": "definite_integral" }
    }
  ]
}
```

Unknown fields are rejected with 422. The UI does not send book or chapter filters to this endpoint.

## Grade

`POST /api/practice/grade`

Already implemented. Body:

```json
{ "question_id": "integral-2", "submitted_value": 9 }
```

Response:

```json
{
  "correct": true,
  "expected_value": 9,
  "submitted_value": 9,
  "feedback": "Correct!"
}
```

An unknown `question_id` is 404. A non-numeric answer is rejected by the Next route and is not forwarded.

## Chat

`POST /api/chat`

Not implemented yet. `Accept: text/event-stream`. Body:

```json
{
  "question": "Integrate x^2 from 0 to 3",
  "subject": "Engineering mathematics",
  "book_id": "calc-1",
  "history": [{ "role": "user", "text": "What is an integral?" }]
}
```

`subject` and `book_id` may be null. `history[].role` is `"user"` or `"assistant"`.

Events are separated by a blank line. `data` may be split across lines. Comment lines start with `:`.

`meta`

```json
{ "message_id": "msg_1", "mode": "problem_solving", "retrieval_note": "optional" }
```

`mode` is `"textbook_qa"`, `"problem_solving"`, or `"out_of_scope"`.

`segment`

```json
{
  "id": "seg_1",
  "text": "The power rule gives x^3/3.",
  "source_type": "textbook",
  "citations": [
    { "book": "OpenStax Calculus Volume 1", "chapter": "Integrals", "section": "The power rule", "page": 342, "chunk_id": "calc1-power" }
  ],
  "display_math": "optional latex"
}
```

`source_type` is `"textbook"`, `"solver"`, or `"model"`.

`attempt`

```json
{
  "attempt": 1,
  "model_answer": "27",
  "solver_answer": "9",
  "matched": false,
  "feedback": "Divide by 3.",
  "solver": "SymPy",
  "params": { "expr": "x**2" }
}
```

`model_answer` and `solver_answer` match `RepairAttempt` and may be null. `feedback`, `solver`, and `params` are optional.

`done`

```json
{ "note": "optional" }
```

`error`

```json
{ "message": "The answer was cut off. Ask again." }
```

`solver_result`

The payload is a solve response without `attempts`. Attempts still arrive as `attempt` events. `status` is `"verified"`, `"solver_result_unmatched"`, or `"failed"`.

```json
{
  "status": "verified",
  "note": "optional",
  "solver_result": {
    "request_id": "req_1",
    "status": "success",
    "solver": "physics_force",
    "numeric_result": 1.0,
    "result": 1.0,
    "exact_result": "optional and not shown for lists, matrices, or dicts",
    "details": {
      "unit": "N",
      "preflight": {
        "conversions": [
          { "field": "mass", "from": "500 g", "to": "0.5 kg" },
          { "field": "acceleration", "from": "2 m/s^2", "to": "2 m/s^2" }
        ]
      }
    },
    "verification": { "passed": true, "message": "Force equals mass times acceleration." },
    "error": null
  }
}
```

`result` changes shape with the solver. A few that the UI already renders:

- `unit_convert`: `{ "value": 5000.0, "unit": "m", "dimension": "length", "input_value": 5.0, "input_unit": "km" }`
- `solve_equation`: `["2", "3"]`, with `details.variable`
- `matrix_eigenvalues`: `[{ "real": 0.0, "imaginary": 1.0 }, { "real": 0.0, "imaginary": -1.0 }]`
- `matrix_inverse`: `[[0.6666666666666666, -0.3333333333333333], [-0.3333333333333333, 0.6666666666666666]]`
- `solve_system`: `[{ "x": "2", "y": "1" }]`
- `chemistry_balance_equation`: `{ "balanced_equation": "2H2 + O2 -> 2H2O", "coefficients": [2, 1, 2] }`
- `descriptive_stats`: `{ "count": 4, "mean": 2.5, "median": 2.5, "mode": [1, 2, 3, 4], "min": 1, "max": 4 }`

A failure looks like `{ "status": "failed", "solver_result": { "status": "failed", "solver": "matrix_inverse", "error": "Singular matrix" } }`.

An optional `latex` string next to an exact result would let the UI render that result as maths instead of plain text.

`clarification`

```json
{
  "message": "I could not safely map this wording to a supported calculation. Include the quantity, values and units, or use a structured solver request.",
  "supported_patterns": [
    "unit conversion",
    "force from mass and acceleration",
    "Ohm law current",
    "kinetic energy",
    "molar mass of supported formulas",
    "balancing simple chemical equations",
    "Reynolds number",
    "explicit algebraic equations"
  ]
}
```

If `message` starts with `Could not form a valid solver request`, the UI replaces it. That form can also include an `interpretation` object, which the UI ignores.

## Books

`GET /api/books`

Not implemented yet. Response:

```json
[
  {
    "id": "calc-1",
    "title": "OpenStax Calculus Volume 1",
    "short_title": "Calculus Volume 1",
    "subject": "Engineering mathematics",
    "chapters": [{ "id": "integrals", "title": "Integrals" }]
  }
]
```

`subject` is `"Engineering mathematics"` or `"Physics"`.

## Sources

`GET /api/sources/{chunk_id}`

Not implemented yet. Response:

```json
{
  "chunk_id": "calc1-power",
  "book": "OpenStax Calculus Volume 1",
  "book_id": "calc-1",
  "subject": "Engineering mathematics",
  "chapter": "Integrals",
  "section": "The power rule",
  "page": 342,
  "text": "The passage text."
}
```

Unknown ids are 404.

## Flashcards

`GET /api/flashcards`

Not implemented yet. Proposed response, following the card the UI already renders:

```json
[
  {
    "id": "card_1",
    "subject": "Physics",
    "book": "OpenStax University Physics Volume 2",
    "chapter": "Electromagnetic induction",
    "front": "Lenz's law",
    "front_math": "optional latex",
    "back": "The induced current opposes the change in flux.",
    "citation": {
      "book": "OpenStax University Physics Volume 2",
      "chapter": "Electromagnetic induction",
      "section": "Lenz's law",
      "page": 478,
      "chunk_id": "phys2-lenz"
    }
  }
]
```

## Feedback

`POST /api/feedback`

Not implemented yet. Proposed body:

```json
{ "message_id": "msg_1", "value": "up" }
```

`value` is `"up"` or `"down"`. A successful response can be empty. The UI only checks the status code.

The payload the UI now sends is the proposal in the next section. Short answers are graded by the model against the retrieved passage, so that feedback is labelled Model.

## Proposed, needs backend agreement

These shapes are what the UI is ready to consume. Names are snake_case.

`GET /api/practice/capabilities`

```json
{
  "types": ["mcq", "msq", "nat", "short"],
  "filters": { "book": true, "chapter": true }
}
```

`types` uses `mcq`, `msq`, `nat`, and `short`. Until this route exists, a 404 means numeric questions only, with book and chapter filters off.

`POST /api/practice`

```json
{
  "types": ["mcq", "short"],
  "book_id": "calc-1",
  "chapter_id": "integrals"
}
```

Response questions include the type and, for `mcq` and `msq`, the options:

```json
{
  "questions": [
    {
      "question_id": "q1",
      "type": "mcq",
      "prompt": "What is the integral of x^2 from 0 to 3?",
      "book_id": "calc-1",
      "chapter_id": "integrals",
      "options": [
        { "id": "a", "text": "3" },
        { "id": "c", "text": "9" }
      ]
    }
  ]
}
```

`POST /api/practice/grade`

```json
{ "question_id": "q1", "answer": ["a", "c"] }
```

`answer` is a string, or a list of option ids for multiple select.

```json
{
  "result": "partial",
  "expected": "The parts formula",
  "missing": ["du"],
  "feedback": "The product rule rearranges to the parts formula.",
  "source_type": "model",
  "citation": {
    "book": "OpenStax Calculus Volume 2",
    "chapter": "Techniques of integration",
    "section": "Integration by parts",
    "page": 12,
    "chunk_id": "calc2-ibp"
  }
}
```

`result` is `correct`, `incorrect`, `partial`, or `ungraded`. `missing` lists the points a partial answer left out. Short answers are graded by the model against the retrieved passage, so `source_type` is `model` and the citation is the passage. Numeric grades stay on the solver.

`GET /api/flashcards`

A card may include a citation. A 404 or an empty list means the textbooks are not loaded yet.

```json
{
  "id": "card_1",
  "subject": "Physics",
  "book": "OpenStax University Physics Volume 2",
  "chapter": "Electromagnetic induction",
  "front": "Lenz's law",
  "back": "The induced current opposes the change in flux.",
  "citation": {
    "book": "OpenStax University Physics Volume 2",
    "chapter": "Electromagnetic induction",
    "section": "Lenz's law",
    "page": 478,
    "chunk_id": "phys2-lenz"
  }
}
```

`POST /api/feedback`

```json
{
  "message_id": "msg_1",
  "vote": "down",
  "question": "Integrate x^3 from 0 to 2",
  "answer_text": "The solver produced this result.",
  "mode": "problem",
  "segments": [
    {
      "id": "seg-1",
      "text": "The solver produced this result.",
      "source_type": "solver",
      "citations": []
    }
  ],
  "attempts": [
    {
      "attempt": 1,
      "model_answer": "2",
      "solver_answer": "4",
      "matched": false,
      "feedback": "The integral of x^3 is x^4/4."
    }
  ],
  "outcome_status": "unmatched",
  "reason": "Wrong answer",
  "comment": "optional, at most 500 characters",
  "created_at": "2026-11-10T09:00:00.000Z"
}
```

`vote` is `"up"`, `"down"`, or `null` when the vote is taken back. `reason` and `comment` are optional. `model_answer` and `solver_answer` may be null.

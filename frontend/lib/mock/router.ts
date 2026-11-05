import { bookById, citationFor, citationMatches } from "@/lib/mock/corpus";
import { SUBJECTS, type AnswerSegment, type ChatMode, type ChatRequest, type Citation, type HistoryTurn, type SolverAttempt, type Subject } from "@/lib/types";

export type PlannedAnswer = {
  mode: ChatMode;
  retrievalNote?: string;
  attempts: SolverAttempt[];
  segments: AnswerSegment[];
  note?: string;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isSubject(value: string): value is Subject {
  return SUBJECTS.some((subject) => subject === value);
}

export function parseChatRequest(value: unknown): ChatRequest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.question !== "string") return null;
  const question = record.question.trim();
  if (!question || question.length > 2000) return null;

  const subject = typeof record.subject === "string" && isSubject(record.subject) ? record.subject : null;
  const bookId =
    typeof record.bookId === "string" && bookById(record.bookId) ? record.bookId : null;

  const history: HistoryTurn[] = [];
  if (Array.isArray(record.history)) {
    for (const turn of record.history.slice(-8)) {
      if (!turn || typeof turn !== "object") continue;
      const item = turn as Record<string, unknown>;
      if ((item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string") continue;
      history.push({ role: item.role, text: item.text.slice(0, 1500) });
    }
  }

  return { question, subject, bookId, history };
}

function cite(chunkId: string): Citation {
  return citationFor(chunkId);
}

function buildSegments(
  rows: Array<Omit<AnswerSegment, "id">>,
): AnswerSegment[] {
  return rows.map((row, index) => ({ ...row, id: `seg-${index + 1}` }));
}

function lowConfidence(text: string): PlannedAnswer {
  return {
    mode: "textbook",
    retrievalNote:
      "Nothing relevant was found in the indexed textbooks. This answer is from the model alone.",
    attempts: [],
    segments: buildSegments([
      { text, sourceType: "model", citations: [] },
    ]),
  };
}

function refusal(): PlannedAnswer {
  return {
    mode: "out_of_scope",
    attempts: [],
    segments: buildSegments([
      {
        text: "StemMatrix covers engineering mathematics and physics from the indexed textbooks: calculus, linear algebra, and electricity and magnetism. That question sits outside those subjects.",
        sourceType: "model",
        citations: [],
      },
    ]),
  };
}

function priorUserText(history: HistoryTurn[]): string {
  const turn = [...history].reverse().find((item) => item.role === "user");
  return turn ? normalize(turn.text) : "";
}

function lenzAnswer(simple: boolean): PlannedAnswer {
  return {
    mode: "textbook",
    attempts: [],
    segments: buildSegments([
      {
        text: simple
          ? "If a magnetic change tries to push more flux through a loop, the induced current makes a field that pushes back. The induced effect fights the change."
          : "The induced emf drives a current whose magnetic field opposes the change in flux that produced it. That opposition is the content of the minus sign in Faraday's law.",
        sourceType: "textbook",
        citations: [cite("phys2-lenz")],
      },
      {
        text: "Faraday's law gives the size of the induced emf. Lenz's law gives the direction.",
        sourceType: "textbook",
        citations: [cite("phys2-faraday"), cite("phys2-lenz")],
      },
    ]),
  };
}

function electricFieldAnswer(simple: boolean): PlannedAnswer {
  return {
    mode: "textbook",
    attempts: [],
    segments: buildSegments([
      {
        text: simple
          ? "An electric field is a map of the push a positive charge would feel at each point. Near a positive source the push is outward, and it gets weaker quickly as you move away."
          : "An electric field is the electric force per unit positive test charge. For a point charge the field is radial, points away from a positive source, and has magnitude $E = k|q|/r^2$.",
        sourceType: "textbook",
        citations: [cite("phys2-efield")],
        displayMath: simple ? undefined : "E = \\dfrac{k|q|}{r^2}",
      },
    ]),
  };
}

function integralRepair(): PlannedAnswer {
  return {
    mode: "problem",
    attempts: [
      {
        attempt: 1,
        modelAnswer: "$27$",
        solverAnswer: "$9$",
        match: false,
        solver: "SymPy",
        params: { type: "definite_integral", expr: "x**2", lower: 0, upper: 3 },
        feedback:
          "The antiderivative of x**2 is x**3/3, not x**3. Evaluating x**3 from 0 to 3 gives 27. Dividing by 3 gives 9.",
      },
      {
        attempt: 2,
        modelAnswer: "$9$",
        solverAnswer: "$9$",
        match: true,
        solver: "SymPy",
        params: { type: "definite_integral", expr: "x**2", lower: 0, upper: 3 },
      },
    ],
    segments: buildSegments([
      {
        text: "The power rule says the antiderivative of $x^2$ is $x^3/3$.",
        sourceType: "textbook",
        citations: [cite("calc1-power")],
      },
      {
        text: "Evaluated from 0 to 3, the definite integral is 9.",
        sourceType: "solver",
        citations: [],
        displayMath: "\\int_0^3 x^2\\,dx = \\left[\\frac{x^3}{3}\\right]_0^3 = 9",
      },
      {
        text: "The first draft reported 27, which is $3^3$ with the factor of $1/3$ left out. The solver sent that error back, and the second draft matched.",
        sourceType: "model",
        citations: [],
      },
    ]),
  };
}

function eigenvalueRepair(): PlannedAnswer {
  return {
    mode: "problem",
    attempts: [
      {
        attempt: 1,
        modelAnswer: "$2, 2$",
        solverAnswer: "$1, 3$",
        match: false,
        solver: "NumPy",
        params: { type: "eigenvalues", matrix: "[[2, 1], [1, 2]]" },
        feedback:
          "The diagonal entries are not the eigenvalues. det([[2-λ, 1], [1, 2-λ]]) = (2-λ)^2 - 1 = λ^2 - 4λ + 3 = 0, so λ = 1 or λ = 3.",
      },
      {
        attempt: 2,
        modelAnswer: "$1, 3$",
        solverAnswer: "$1, 3$",
        match: true,
        solver: "NumPy",
        params: { type: "eigenvalues", matrix: "[[2, 1], [1, 2]]" },
      },
    ],
    segments: buildSegments([
      {
        text: "Eigenvalues are the roots of $\\det(A-\\lambda I)=0$. They match the diagonal only when the matrix is triangular.",
        sourceType: "textbook",
        citations: [cite("linalg-eigen")],
      },
      {
        text: "For this matrix the eigenvalues are 1 and 3.",
        sourceType: "solver",
        citations: [],
        displayMath: "\\lambda = 1,\\ 3",
      },
    ]),
  };
}

function derivativeMatch(): PlannedAnswer {
  return {
    mode: "problem",
    attempts: [
      {
        attempt: 1,
        modelAnswer: "$\\cos x$",
        solverAnswer: "$\\cos x$",
        match: true,
        solver: "SymPy",
        params: { type: "derivative", expr: "sin(x)", variable: "x" },
      },
    ],
    segments: buildSegments([
      {
        text: "Differentiating $\\sin x$ gives $\\cos x$.",
        sourceType: "textbook",
        citations: [cite("calc1-deriv-sin")],
        displayMath: "\\frac{d}{dx}\\sin x = \\cos x",
      },
      {
        text: "The solver agrees with the model on the first attempt.",
        sourceType: "solver",
        citations: [],
      },
    ]),
  };
}

function sineIntegral(): PlannedAnswer {
  return {
    mode: "problem",
    attempts: [
      {
        attempt: 1,
        modelAnswer: "$2$",
        solverAnswer: "$2$",
        match: true,
        solver: "SymPy",
        params: { type: "definite_integral", expr: "sin(x)", lower: 0, upper: "pi" },
      },
    ],
    segments: buildSegments([
      {
        text: "An antiderivative of $\\sin x$ is $-\\cos x$. From $0$ to $\\pi$ the value is $1 - (-1) = 2$.",
        sourceType: "textbook",
        citations: [cite("calc1-sin")],
        displayMath: "\\int_0^{\\pi}\\sin x\\,dx = 2",
      },
      {
        text: "SymPy returns the same value.",
        sourceType: "solver",
        citations: [],
      },
    ]),
  };
}

function fresnelExhausted(): PlannedAnswer {
  return {
    mode: "problem",
    note: "The model did not match the solver after 2 attempts. The value below is the solver's result.",
    attempts: [
      {
        attempt: 1,
        modelAnswer: "$0.8415$",
        solverAnswer: "$0.3103$",
        match: false,
        solver: "SciPy",
        params: { type: "definite_integral", expr: "sin(x**2)", lower: 0, upper: 1 },
        feedback:
          "sin(1) is not the integral of sin(x**2). The antiderivative is not elementary. A numerical quadrature from 0 to 1 gives about 0.3103.",
      },
      {
        attempt: 2,
        modelAnswer: "$0.5$",
        solverAnswer: "$0.3103$",
        match: false,
        solver: "SciPy",
        params: { type: "definite_integral", expr: "sin(x**2)", lower: 0, upper: 1 },
        feedback: "0.5 still does not match the quadrature.",
      },
    ],
    segments: buildSegments([
      {
        text: "No elementary antiderivative is available, so the value is a numerical quadrature.",
        sourceType: "model",
        citations: [],
      },
      {
        text: "SciPy reports the definite integral.",
        sourceType: "solver",
        citations: [],
        displayMath: "\\int_0^1 \\sin(x^2)\\,dx \\approx 0.3103",
      },
    ]),
  };
}

function partsFormula(): PlannedAnswer {
  return {
    mode: "textbook",
    attempts: [],
    segments: buildSegments([
      {
        text: "Integration by parts is the product rule written as an integral.",
        sourceType: "textbook",
        citations: [cite("calc2-ibp")],
        displayMath: "\\int u\\,dv = uv - \\int v\\,du",
      },
    ]),
  };
}

function magneticField(): PlannedAnswer {
  return {
    mode: "textbook",
    attempts: [],
    segments: buildSegments([
      {
        text: "A magnetic field pushes on a moving charge. The force is perpendicular to both the velocity and the field, so a charge at rest feels no magnetic force.",
        sourceType: "textbook",
        citations: [cite("phys2-bfield")],
        displayMath: "\\vec{F} = q\\,\\vec{v}\\times\\vec{B}",
      },
    ]),
  };
}

function exampleFor(topic: string): PlannedAnswer | null {
  if (topic.includes("lenz") || topic.includes("faraday") || topic.includes("induced")) {
    return {
      mode: "textbook",
      attempts: [],
      segments: buildSegments([
        {
          text: "Suppose the flux into the page through a coil increases. Lenz's law says the induced current makes a field out of the page, opposing that increase.",
          sourceType: "textbook",
          citations: [cite("phys2-lenz")],
        },
      ]),
    };
  }
  if (topic.includes("electric field")) {
    return {
      mode: "textbook",
      attempts: [],
      segments: buildSegments([
        {
          text: "Place a positive source at the origin. A positive test charge to its right is pushed further right. Move the test charge twice as far away and the push drops to a quarter.",
          sourceType: "textbook",
          citations: [cite("phys2-efield")],
        },
      ]),
    };
  }
  if (topic.includes("x") && (topic.includes("integrat") || topic.includes("integral"))) {
    return {
      mode: "problem",
      attempts: [
        {
          attempt: 1,
          modelAnswer: "$1/3$",
          solverAnswer: "$1/3$",
          match: true,
          solver: "SymPy",
          params: { type: "definite_integral", expr: "x**2", lower: 0, upper: 1 },
        },
      ],
      segments: buildSegments([
        {
          text: "The same power rule on a smaller interval gives one third.",
          sourceType: "textbook",
          citations: [cite("calc1-power")],
          displayMath: "\\int_0^1 x^2\\,dx = \\frac{1}{3}",
        },
        {
          text: "The solver matches the model.",
          sourceType: "solver",
          citations: [],
        },
      ]),
    };
  }
  return null;
}

function simplerFor(topic: string): PlannedAnswer | null {
  if (topic.includes("lenz")) return lenzAnswer(true);
  if (topic.includes("electric field")) return electricFieldAnswer(true);
  if (topic.includes("integrat") || topic.includes("eigen") || topic.includes("derivative")) {
    return {
      mode: "textbook",
      attempts: [],
      retrievalNote: undefined,
      segments: buildSegments([
        {
          text: "The number in a checked answer comes from the solver. The sentences next to a book name come from a retrieved passage. A sentence with the Model label is the language model's own wording.",
          sourceType: "model",
          citations: [],
        },
      ]),
    };
  }
  return null;
}

const STEM_PATTERN =
  /(integrat|deriv|matrix|eigen|field|flux|force|charge|current|voltage|calculus|physics|equation|formula|theorem|vector|probabilit|limit|differenti|\bsin\b|\bcos\b|magnetic|electric|ohm|energy|momentum|induct|circuit|gauss|ampere|coulomb|lenz|faraday|\blaw\b)/;

function planCore(question: string, history: HistoryTurn[]): PlannedAnswer {
  const q = normalize(question);
  const topic = priorUserText(history);
  const wantsSimpler = /(simpler|more simply|simple terms|easier to follow|explain that)/.test(q);
  const wantsExample = /\bexample\b/.test(q);

  if (wantsSimpler && topic) {
    const simpler = simplerFor(topic);
    if (simpler) return simpler;
  }
  if (wantsExample && topic) {
    const example = exampleFor(topic);
    if (example) return example;
  }

  const sineOfSquare = /sin\s*\(\s*x\s*(\*\*|\^)\s*2\s*\)|sin\s*x\s*(\*\*|\^)\s*2/.test(q);
  if ((q.includes("integrat") || q.includes("integral")) && sineOfSquare) return fresnelExhausted();
  if ((q.includes("integrat") || q.includes("integral")) && /x\s*(\*\*|\^)\s*2/.test(q) && q.includes("0") && q.includes("3")) {
    return integralRepair();
  }
  if (q.includes("eigen")) return eigenvalueRepair();
  if ((q.includes("deriv") || q.includes("d/dx")) && q.includes("sin") && !sineOfSquare) return derivativeMatch();
  if ((q.includes("integrat") || q.includes("integral")) && q.includes("sin") && (q.includes("pi") || q.includes("π"))) {
    return sineIntegral();
  }
  if (q.includes("integration by parts") || q.includes("integrate by parts")) return partsFormula();
  if (q.includes("lenz")) return lenzAnswer(false);
  if (q.includes("faraday")) {
    return {
      mode: "textbook",
      attempts: [],
      segments: buildSegments([
        {
          text: "The induced emf around a closed path equals the negative rate of change of magnetic flux through any surface bounded by that path.",
          sourceType: "textbook",
          citations: [cite("phys2-faraday")],
          displayMath: "\\mathcal{E} = -\\frac{d\\Phi_B}{dt}",
        },
      ]),
    };
  }
  if (q.includes("electric field")) return electricFieldAnswer(false);
  if (q.includes("magnetic field")) return magneticField();
  if ((q.includes("integrat") || q.includes("integral")) && q.includes("sin")) {
    return {
      mode: "textbook",
      attempts: [],
      segments: buildSegments([
        {
          text: "An antiderivative of $\\sin x$ is $-\\cos x$.",
          sourceType: "textbook",
          citations: [cite("calc1-sin")],
          displayMath: "\\int \\sin x\\,dx = -\\cos x + C",
        },
      ]),
    };
  }

  if (STEM_PATTERN.test(q)) {
    return lowConfidence(
      "No indexed passage matched this question. Treat the wording here as the model's own, with no page to open and no solver check.",
    );
  }
  return refusal();
}

function applyFilter(plan: PlannedAnswer, subject: Subject | null, bookId: string | null): PlannedAnswer {
  if ((!subject && !bookId) || plan.mode === "out_of_scope") return plan;

  const segments = plan.segments.flatMap((segment) => {
    if (segment.sourceType !== "textbook") return [segment];
    const citations = segment.citations.filter((citation) => citationMatches(citation, subject, bookId));
    if (citations.length === 0) return [];
    return [{ ...segment, citations }];
  });

  if (segments.some((segment) => segment.sourceType === "textbook")) {
    return { ...plan, segments };
  }

  if (segments.length === 0) {
    const book = bookId ? bookById(bookId) : undefined;
    const scope = book?.shortTitle ?? subject ?? "the current filter";
    return {
      mode: "textbook",
      attempts: [],
      retrievalNote: `Nothing relevant was found in ${scope}.`,
      segments: buildSegments([
        {
          text: "No passage in the current filter supports an answer. Clear the filter, or pick a book that contains the topic.",
          sourceType: "model",
          citations: [],
        },
      ]),
    };
  }

  return {
    ...plan,
    segments,
    retrievalNote: "No passage in the selected books supported the formula context. Solver and model parts are unchanged.",
  };
}

export function planAnswer(request: ChatRequest): PlannedAnswer {
  return applyFilter(planCore(request.question, request.history), request.subject, request.bookId);
}

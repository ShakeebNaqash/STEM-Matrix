import { citationFor } from "@/lib/mock/corpus";
import { parseDecimal } from "@/lib/number";
import type {
  AnswerSegment,
  GradeResult,
  PracticeOption,
  PracticeQuestion,
  PracticeQuestionType,
} from "@/lib/types";

type BankQuestion = {
  id: string;
  type: PracticeQuestionType;
  prompt: string;
  bookId: string;
  book: string;
  chapterId: string;
  chapter: string;
  options?: PracticeOption[];
  answer: string | string[];
  expected: string;
  segments: AnswerSegment[];
};

function segment(
  id: string,
  text: string,
  sourceType: AnswerSegment["sourceType"],
  chunkId?: string,
  displayMath?: string,
): AnswerSegment {
  return {
    id,
    text,
    sourceType,
    citations: chunkId ? [citationFor(chunkId)] : [],
    displayMath,
  };
}

const bank: BankQuestion[] = [
  {
    id: "q-int-mcq",
    type: "mcq",
    prompt: "What is $\\int_0^3 x^2\\,dx$?",
    bookId: "calc-1",
    book: "OpenStax Calculus Volume 1",
    chapterId: "integrals",
    chapter: "Integrals",
    options: [
      { id: "a", text: "$3$" },
      { id: "b", text: "$6$" },
      { id: "c", text: "$9$" },
      { id: "d", text: "$27$" },
    ],
    answer: "c",
    expected: "9",
    segments: [
      segment(
        "q-int-mcq-s",
        "The antiderivative is $x^3/3$. At the bounds, $27/3 - 0 = 9$. The value 27 forgets the factor of $1/3$.",
        "solver",
        undefined,
        "\\int_0^3 x^2\\,dx = 9",
      ),
      segment(
        "q-int-mcq-t",
        "The power rule supplies the antiderivative used above.",
        "textbook",
        "calc1-power",
      ),
    ],
  },
  {
    id: "q-int-nat",
    type: "nat",
    prompt: "Evaluate $\\int_0^1 2x\\,dx$. Enter the number.",
    bookId: "calc-1",
    book: "OpenStax Calculus Volume 1",
    chapterId: "integrals",
    chapter: "Integrals",
    answer: "1",
    expected: "1",
    segments: [
      segment(
        "q-int-nat-s",
        "An antiderivative of $2x$ is $x^2$. From 0 to 1 that is $1 - 0 = 1$.",
        "solver",
        undefined,
        "\\int_0^1 2x\\,dx = 1",
      ),
    ],
  },
  {
    id: "q-int-msq",
    type: "msq",
    prompt: "Select every statement that is true for $\\int x^2\\,dx$.",
    bookId: "calc-1",
    book: "OpenStax Calculus Volume 1",
    chapterId: "integrals",
    chapter: "Integrals",
    options: [
      { id: "a", text: "An antiderivative is $\\frac{x^3}{3}+C$." },
      { id: "b", text: "An antiderivative is $x^3+C$." },
      { id: "c", text: "The power rule applies, since the exponent is not $-1$." },
      { id: "d", text: "The integrand is a constant function." },
    ],
    answer: ["a", "c"],
    expected: "An antiderivative is x^3/3 + C, and the power rule applies.",
    segments: [
      segment(
        "q-int-msq-t",
        "The power rule gives $\\frac{x^3}{3}+C$. The integrand $x^2$ is not constant, and $x^3$ is missing the factor of $1/3$.",
        "textbook",
        "calc1-power",
      ),
    ],
  },
  {
    id: "q-ibp-short",
    type: "short",
    prompt: "State the formula for integration by parts.",
    bookId: "calc-2",
    book: "OpenStax Calculus Volume 2",
    chapterId: "techniques",
    chapter: "Techniques of integration",
    answer: ["uv", "du"],
    expected: "∫ u dv = uv − ∫ v du",
    segments: [
      segment(
        "q-ibp-short-t",
        "The product rule rearranges to the parts formula.",
        "model",
        "calc2-ibp",
        "\\int u\\,dv = uv - \\int v\\,du",
      ),
    ],
  },
  {
    id: "q-eigen-mcq",
    type: "mcq",
    prompt: "What are the eigenvalues of $\\begin{bmatrix}2&1\\\\1&2\\end{bmatrix}$?",
    bookId: "linalg",
    book: "Linear Algebra (open notes)",
    chapterId: "eigen",
    chapter: "Eigenvalues",
    options: [
      { id: "a", text: "$2$ and $2$" },
      { id: "b", text: "$1$ and $3$" },
      { id: "c", text: "$0$ and $4$" },
      { id: "d", text: "$1$ and $1$" },
    ],
    answer: "b",
    expected: "1 and 3",
    segments: [
      segment(
        "q-eigen-s",
        "The characteristic equation is $(2-\\lambda)^2 - 1 = 0$, so $\\lambda^2 - 4\\lambda + 3 = 0$, and $\\lambda = 1$ or $\\lambda = 3$.",
        "solver",
        undefined,
        "\\lambda = 1,\\ 3",
      ),
      segment(
        "q-eigen-t",
        "The diagonal entries 2 and 2 are not the eigenvalues, because the matrix is not triangular.",
        "textbook",
        "linalg-eigen",
      ),
    ],
  },
  {
    id: "q-lenz-mcq",
    type: "mcq",
    prompt: "Lenz's law says the induced current produces a field that does what?",
    bookId: "phys-2",
    book: "OpenStax University Physics Volume 2",
    chapterId: "induction",
    chapter: "Electromagnetic induction",
    options: [
      { id: "a", text: "Opposes the change in flux that produced it." },
      { id: "b", text: "Increases that change in flux." },
      { id: "c", text: "Is always zero." },
      { id: "d", text: "Points in a fixed compass direction." },
    ],
    answer: "a",
    expected: "It opposes the change in flux.",
    segments: [
      segment(
        "q-lenz-mcq-t",
        "The induced field fights the change in flux. It does not have to point north, and it is not automatically zero.",
        "textbook",
        "phys2-lenz",
      ),
    ],
  },
  {
    id: "q-charge-nat",
    type: "nat",
    prompt:
      "A steady current of $2\\,\\mathrm{A}$ flows for $3\\,\\mathrm{s}$. How much charge passes a point in the wire, in coulombs?",
    bookId: "phys-2",
    book: "OpenStax University Physics Volume 2",
    chapterId: "charges",
    chapter: "Electric charges and fields",
    answer: "6",
    expected: "6",
    segments: [
      segment(
        "q-charge-s",
        "Charge is current times time when the current is steady: $Q = It = 2 \\times 3 = 6\\,\\mathrm{C}$.",
        "solver",
        undefined,
        "Q = 6\\,\\mathrm{C}",
      ),
    ],
  },
  {
    id: "q-efield-msq",
    type: "msq",
    prompt: "Select every statement that agrees with the point-charge field.",
    bookId: "phys-2",
    book: "OpenStax University Physics Volume 2",
    chapterId: "charges",
    chapter: "Electric charges and fields",
    options: [
      { id: "a", text: "The field points away from a positive point charge." },
      { id: "b", text: "The magnitude falls as $1/r^2$." },
      { id: "c", text: "The field is measured in coulombs." },
      { id: "d", text: "A charge at rest feels no electric force." },
    ],
    answer: ["a", "b"],
    expected: "The field points away from a positive charge and falls as 1/r^2.",
    segments: [
      segment(
        "q-efield-t",
        "The field of a point charge is radial, outward for positive $q$, with magnitude $k|q|/r^2$. Its unit is newtons per coulomb, not coulombs, and a charge feels the force whether or not it is moving.",
        "textbook",
        "phys2-efield",
      ),
    ],
  },
  {
    id: "q-lenz-short",
    type: "short",
    prompt: "State Lenz's law in a sentence.",
    bookId: "phys-2",
    book: "OpenStax University Physics Volume 2",
    chapterId: "induction",
    chapter: "Electromagnetic induction",
    answer: ["oppose"],
    expected: "The induced current opposes the change in flux that produced it.",
    segments: [
      segment(
        "q-lenz-short-t",
        "A sentence that says the induced effect opposes the change in flux is enough.",
        "model",
        "phys2-lenz",
      ),
    ],
  },
];

export type PracticeBankQuestion = BankQuestion;

export function practiceByType(type: PracticeQuestionType): PracticeBankQuestion[] {
  return bank.filter((question) => question.type === type);
}

function toPublic(question: BankQuestion): PracticeQuestion {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    bookId: question.bookId,
    book: question.book,
    chapter: question.chapter,
    options: question.options,
  };
}

export function selectPracticeQuestions(input: {
  bookId: string | null;
  chapterId: string | null;
  types: PracticeQuestionType[];
}): PracticeQuestion[] {
  const types = input.types.length > 0 ? input.types : (["mcq", "msq", "nat", "short"] as const);
  const filtered = bank.filter((question) => {
    if (!types.includes(question.type)) return false;
    if (input.bookId && question.bookId !== input.bookId) return false;
    if (input.chapterId && question.chapterId !== input.chapterId) return false;
    return true;
  });

  const picked: BankQuestion[] = [];
  for (const type of types) {
    const found = filtered.find((question) => question.type === type);
    if (found) picked.push(found);
  }
  for (const question of filtered) {
    if (picked.length >= 4) break;
    if (!picked.includes(question)) picked.push(question);
  }
  return picked.slice(0, 4).map(toPublic);
}

function numbersMatch(given: string, expected: string): boolean {
  const value = parseDecimal(given);
  const target = parseDecimal(expected);
  if (value === null || target === null) return false;
  return Math.abs(value - target) < 0.01;
}

function keywordHits(given: string, keywords: string[]): { found: string[]; missing: string[] } {
  const haystack = given.toLowerCase().replace(/\s+/g, "");
  const found: string[] = [];
  const missing: string[] = [];
  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase().replace(/\s+/g, ""))) found.push(keyword);
    else missing.push(keyword);
  }
  return { found, missing };
}

export function gradePractice(
  questionId: string,
  answer: string | string[],
  options?: { shortUngraded?: boolean },
): GradeResult | null {
  const question = bank.find((item) => item.id === questionId);
  if (!question) return null;

  if (question.type === "short" && options?.shortUngraded) {
    return { result: "ungraded", expected: question.expected, segments: question.segments };
  }

  let result: GradeResult["result"] = "incorrect";
  let missing: string[] | undefined;
  switch (question.type) {
    case "mcq":
      result = typeof answer === "string" && answer === question.answer ? "correct" : "incorrect";
      break;
    case "nat":
      result =
        typeof answer === "string" && typeof question.answer === "string" && numbersMatch(answer, question.answer)
          ? "correct"
          : "incorrect";
      break;
    case "msq": {
      const given = Array.isArray(answer) ? [...answer].sort() : [];
      const expected = Array.isArray(question.answer) ? [...question.answer].sort() : [];
      result = given.length === expected.length && given.every((id, index) => id === expected[index]) ? "correct" : "incorrect";
      break;
    }
    case "short": {
      if (typeof answer !== "string" || !Array.isArray(question.answer)) {
        result = "incorrect";
        break;
      }
      const hits = keywordHits(answer, question.answer);
      if (hits.missing.length === 0) result = "correct";
      else if (hits.found.length > 0) {
        result = "partial";
        missing = hits.missing;
      } else result = "incorrect";
      break;
    }
    default: {
      const neverType: never = question.type;
      return neverType;
    }
  }

  return {
    result,
    expected: question.expected,
    segments: question.segments,
    ...(missing ? { missing } : {}),
  };
}

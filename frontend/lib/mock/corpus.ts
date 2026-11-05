import type { Book, Citation, Flashcard, SourcePassage, Subject } from "@/lib/types";

/**
 * Preview corpus for the interface. These passages are original summaries
 * written for the demo. They are not text copied from the cited books.
 */

export const books: Book[] = [
  {
    id: "calc-1",
    title: "OpenStax Calculus Volume 1",
    shortTitle: "Calculus Volume 1",
    subject: "Engineering mathematics",
    chapters: [
      { id: "derivatives", title: "Derivatives" },
      { id: "integrals", title: "Integrals" },
    ],
  },
  {
    id: "calc-2",
    title: "OpenStax Calculus Volume 2",
    shortTitle: "Calculus Volume 2",
    subject: "Engineering mathematics",
    chapters: [{ id: "techniques", title: "Techniques of integration" }],
  },
  {
    id: "linalg",
    title: "Linear Algebra (open notes)",
    shortTitle: "Linear Algebra",
    subject: "Engineering mathematics",
    chapters: [{ id: "eigen", title: "Eigenvalues" }],
  },
  {
    id: "phys-2",
    title: "OpenStax University Physics Volume 2",
    shortTitle: "University Physics Volume 2",
    subject: "Physics",
    chapters: [
      { id: "charges", title: "Electric charges and fields" },
      { id: "magnetic", title: "Magnetic forces and fields" },
      { id: "induction", title: "Electromagnetic induction" },
    ],
  },
];

type PassageRecord = {
  chunkId: string;
  bookId: string;
  chapterId: string;
  chapter: string;
  section: string;
  page: number;
  text: string;
};

export const passages: PassageRecord[] = [
  {
    chunkId: "calc1-deriv-sin",
    bookId: "calc-1",
    chapterId: "derivatives",
    chapter: "Derivatives",
    section: "Derivatives of trigonometric functions",
    page: 188,
    text: "The derivative of $\\sin x$ is $\\cos x$. The derivative of $\\cos x$ is $-\\sin x$. These hold when $x$ is measured in radians.",
  },
  {
    chunkId: "calc1-power",
    bookId: "calc-1",
    chapterId: "integrals",
    chapter: "Integrals",
    section: "The power rule",
    page: 342,
    text: "For $n \\neq -1$, $\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C$. On a closed interval the same antiderivative is evaluated at the two bounds.",
  },
  {
    chunkId: "calc1-sin",
    bookId: "calc-1",
    chapterId: "integrals",
    chapter: "Integrals",
    section: "Integrals of trigonometric functions",
    page: 351,
    text: "An antiderivative of $\\sin x$ is $-\\cos x$. On $[0, \\pi]$ the definite integral equals $(-\\cos \\pi) - (-\\cos 0) = 2$.",
  },
  {
    chunkId: "calc2-ibp",
    bookId: "calc-2",
    chapterId: "techniques",
    chapter: "Techniques of integration",
    section: "Integration by parts",
    page: 64,
    text: "Integration by parts comes from the product rule. If $u$ and $v$ are differentiable, then $\\int u\\,dv = uv - \\int v\\,du$.",
  },
  {
    chunkId: "linalg-eigen",
    bookId: "linalg",
    chapterId: "eigen",
    chapter: "Eigenvalues",
    section: "The characteristic equation",
    page: 112,
    text: "A number $\\lambda$ is an eigenvalue of a square matrix $A$ when $\\det(A - \\lambda I) = 0$. The diagonal entries are the eigenvalues only when $A$ is triangular.",
  },
  {
    chunkId: "phys2-efield",
    bookId: "phys-2",
    chapterId: "charges",
    chapter: "Electric charges and fields",
    section: "The electric field",
    page: 24,
    text: "The electric field at a point is the electric force on a positive test charge placed there, divided by the size of that charge. For a point charge $q$, the field is radial and has magnitude $E = k|q|/r^2$. It points away from a positive charge.",
  },
  {
    chunkId: "phys2-bfield",
    bookId: "phys-2",
    chapterId: "magnetic",
    chapter: "Magnetic forces and fields",
    section: "Magnetic fields",
    page: 392,
    text: "A magnetic field exerts a force on a moving charge. The force is $q\\,\\vec{v}\\times\\vec{B}$, so it is perpendicular to both the velocity and the field, and it is zero when the charge is at rest.",
  },
  {
    chunkId: "phys2-faraday",
    bookId: "phys-2",
    chapterId: "induction",
    chapter: "Electromagnetic induction",
    section: "Faraday's law",
    page: 470,
    text: "Faraday's law says the induced emf around a closed loop equals the negative rate of change of magnetic flux through the loop: $\\mathcal{E} = -\\frac{d\\Phi_B}{dt}$.",
  },
  {
    chunkId: "phys2-lenz",
    bookId: "phys-2",
    chapterId: "induction",
    chapter: "Electromagnetic induction",
    section: "Lenz's law",
    page: 478,
    text: "Lenz's law fixes the minus sign in Faraday's law. The induced current flows so that its own magnetic field opposes the change in flux that produced the emf. If the flux into the page increases, the induced field points out of the page.",
  },
];

export function bookById(bookId: string): Book | undefined {
  return books.find((book) => book.id === bookId);
}

export function passageById(chunkId: string): PassageRecord | undefined {
  return passages.find((passage) => passage.chunkId === chunkId);
}

export function citationFor(chunkId: string): Citation {
  const passage = passageById(chunkId);
  const book = passage ? bookById(passage.bookId) : undefined;
  if (!passage || !book) {
    throw new Error(`Missing preview passage ${chunkId}`);
  }
  return {
    book: book.title,
    chapter: passage.chapter,
    section: passage.section,
    page: passage.page,
    chunkId: passage.chunkId,
  };
}

export function toSourcePassage(chunkId: string): SourcePassage | undefined {
  const passage = passageById(chunkId);
  const book = passage ? bookById(passage.bookId) : undefined;
  if (!passage || !book) return undefined;
  return {
    chunkId: passage.chunkId,
    book: book.title,
    bookId: book.id,
    subject: book.subject,
    chapter: passage.chapter,
    section: passage.section,
    page: passage.page,
    text: passage.text,
  };
}

export function citationMatches(
  citation: Citation,
  subject: Subject | null,
  bookId: string | null,
): boolean {
  const passage = passageById(citation.chunkId);
  const book = passage ? bookById(passage.bookId) : undefined;
  if (!passage || !book) return false;
  if (subject && book.subject !== subject) return false;
  if (bookId && book.id !== bookId) return false;
  return true;
}

export const flashcards: Flashcard[] = [
  {
    id: "card-lenz",
    subject: "Physics",
    book: "OpenStax University Physics Volume 2",
    chapter: "Electromagnetic induction",
    front: "Lenz's law",
    back: "The induced current creates a magnetic field that opposes the change in flux which produced it.",
    citation: citationFor("phys2-lenz"),
  },
  {
    id: "card-faraday",
    subject: "Physics",
    book: "OpenStax University Physics Volume 2",
    chapter: "Electromagnetic induction",
    front: "Faraday's law",
    frontMath: "\\mathcal{E} = -\\frac{d\\Phi_B}{dt}",
    back: "The induced emf around a closed loop equals the negative rate of change of magnetic flux through the loop.",
    citation: citationFor("phys2-faraday"),
  },
  {
    id: "card-efield",
    subject: "Physics",
    book: "OpenStax University Physics Volume 2",
    chapter: "Electric charges and fields",
    front: "Point-charge field",
    frontMath: "E = \\frac{k|q|}{r^2}",
    back: "The field is radial, points away from a positive charge, and falls with the square of the distance.",
    citation: citationFor("phys2-efield"),
  },
  {
    id: "card-bfield",
    subject: "Physics",
    book: "OpenStax University Physics Volume 2",
    chapter: "Magnetic forces and fields",
    front: "Magnetic force on a charge",
    frontMath: "\\vec{F} = q\\,\\vec{v}\\times\\vec{B}",
    back: "The force is perpendicular to both velocity and field, and it is zero when the charge is at rest.",
    citation: citationFor("phys2-bfield"),
  },
  {
    id: "card-power",
    subject: "Engineering mathematics",
    book: "OpenStax Calculus Volume 1",
    chapter: "Integrals",
    front: "Power rule for integrals",
    frontMath: "\\int x^n\\,dx = \\frac{x^{n+1}}{n+1}+C",
    back: "This form needs $n \\neq -1$. A definite integral uses the same antiderivative at the two bounds.",
    citation: citationFor("calc1-power"),
  },
  {
    id: "card-ibp",
    subject: "Engineering mathematics",
    book: "OpenStax Calculus Volume 2",
    chapter: "Techniques of integration",
    front: "Integration by parts",
    frontMath: "\\int u\\,dv = uv - \\int v\\,du",
    back: "The formula is the product rule, rearranged. Choose $u$ as the factor that gets simpler when differentiated.",
    citation: citationFor("calc2-ibp"),
  },
  {
    id: "card-sin",
    subject: "Engineering mathematics",
    book: "OpenStax Calculus Volume 1",
    chapter: "Derivatives",
    front: "Derivative of sine",
    frontMath: "\\frac{d}{dx}\\sin x = \\cos x",
    back: "The companion result is $\\frac{d}{dx}\\cos x = -\\sin x$. Both assume radians.",
    citation: citationFor("calc1-deriv-sin"),
  },
  {
    id: "card-eigen",
    subject: "Engineering mathematics",
    book: "Linear Algebra (open notes)",
    chapter: "Eigenvalues",
    front: "Eigenvalue test",
    frontMath: "\\det(A-\\lambda I)=0",
    back: "Solve the characteristic equation. Do not read eigenvalues off the diagonal unless the matrix is triangular.",
    citation: citationFor("linalg-eigen"),
  },
];

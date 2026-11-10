import Link from "next/link";
import { MathText } from "@/components/math-text";
import { SourceBadge } from "@/components/source-badge";
import { sourceBorder } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";

const labels = [
  {
    source: "textbook" as const,
    title: "Tied to a page",
    text: "A Textbook sentence is backed by a retrieved passage. Open it and you get the book, chapter, section, and page.",
  },
  {
    source: "solver" as const,
    title: "Computed, then checked",
    text: "A Solver value comes from SymPy, NumPy, or SciPy. If the model disagrees, the mismatch is shown and sent back.",
  },
  {
    source: "model" as const,
    title: "Said out loud",
    text: "A Model sentence has no passage and no solver behind it. The label stays on the line instead of a made-up citation.",
  },
];

export function HomePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-12 sm:px-8 sm:py-16">
        <section className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              IUST · Department of CSE · 2026
            </p>
            <h1 className="font-heading mt-4 max-w-xl text-5xl leading-[1.05] text-foreground sm:text-6xl">
              A STEM answer you can check.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Ask a concept and the reply cites a textbook page. Ask for a number and a solver computes it. Every part of the answer is labelled Textbook, Solver, or Model.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/ask" className={cn(buttonVariants({ size: "lg" }))}>
                Ask a question
              </Link>
              <Link href="/practice" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
                Practice a chapter
              </Link>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              This build uses preview answers. The on-device model is not connected yet.
            </p>
          </div>

          <article className="rounded-2xl bg-card p-5 ring-1 ring-border sm:p-6">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Problem solving
            </p>
            <p className="font-heading mt-2 text-2xl">Integrate x^2 from 0 to 3</p>
            <div className="mt-5 flex flex-col gap-4">
              <SampleSegment source="textbook" cite="Calculus Volume 1 · p. 342">
                The power rule says the antiderivative of $x^2$ is $x^3/3$.
              </SampleSegment>
              <SampleSegment source="solver" math="\int_0^3 x^2\,dx = 9">
                Evaluated from 0 to 3, the definite integral is 9.
              </SampleSegment>
              <SampleSegment source="model">
                The first draft said 27. The solver sent that error back, and the second draft matched.
              </SampleSegment>
            </div>
          </article>
        </section>

        <section className="mt-16 border-t border-border pt-10">
          <h2 className="font-heading text-3xl">The label is the point</h2>
          <ul className="mt-6 divide-y divide-border">
            {labels.map((item) => (
              <li key={item.source} className="grid gap-3 py-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-baseline">
                <SourceBadge source={item.source} />
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4 border-t border-border">
          <StudyLink
            href="/ask"
            kicker="Textbook Q&A"
            title="What is Lenz's law?"
            text="Retrieval pulls a passage from University Physics. The answer names the book, the section, and the page."
          />
          <StudyLink
            href="/practice"
            kicker="Practice"
            title="A set from one chapter"
            text="Multiple choice, multiple select, a typed number, or a short answer. Numbers are graded against the solver."
          />
          <StudyLink
            href="/flashcards"
            kicker="Flashcards"
            title="Formulas, with the page on the back"
            text="Flip a card for the meaning and the citation it was taken from."
          />
        </section>

        <footer className="mt-12 text-sm leading-6 text-muted-foreground">
          StemMatrix is a B.Tech major project at the Islamic University of Science and Technology, Awantipora. The preview corpus is original summary text filed under openly licensed books, including OpenStax Calculus and University Physics.
        </footer>
      </div>
    </div>
  );
}

function SampleSegment({
  source,
  cite,
  math,
  children,
}: {
  source: "textbook" | "solver" | "model";
  cite?: string;
  math?: string;
  children: string;
}) {
  return (
    <section className={cn("border-l-2 pl-4", sourceBorder(source))}>
      <SourceBadge source={source} />
      <MathText text={children} className="font-reading mt-2 text-base leading-7" />
      {math ? <MathText text={`$$${math}$$`} /> : null}
      {cite ? <p className="mt-2 text-xs font-medium text-textbook">{cite}</p> : null}
    </section>
  );
}

function StudyLink({
  href,
  kicker,
  title,
  text,
}: {
  href: string;
  kicker: string;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} className="group grid gap-2 border-b border-border py-6 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-baseline">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{kicker}</p>
      <div>
        <p className="font-heading text-2xl group-hover:underline">{title}</p>
        <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{text}</p>
      </div>
      <p className="text-sm font-medium">Open</p>
    </Link>
  );
}

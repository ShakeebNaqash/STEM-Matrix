"use client";

import katex from "katex";

type Piece =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean };

function parseMath(input: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) {
      pieces.push({ kind: "text", value: input.slice(last, index) });
    }
    if (match[1] !== undefined) {
      pieces.push({ kind: "math", value: match[1], display: true });
    } else if (match[2] !== undefined) {
      pieces.push({ kind: "math", value: match[2], display: false });
    }
    last = index + match[0].length;
  }
  if (last < input.length) {
    pieces.push({ kind: "text", value: input.slice(last) });
  }
  return pieces;
}

export function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const pieces = parseMath(text);
  return (
    <div className={className}>
      {pieces.map((piece, index) => {
        if (piece.kind === "text") {
          return (
            <span key={index} className="whitespace-pre-wrap">
              {piece.value}
            </span>
          );
        }
        const html = katex.renderToString(piece.value, {
          throwOnError: false,
          displayMode: piece.display,
        });
        return (
          <span
            key={index}
            className={piece.display ? "my-3 block overflow-x-auto" : "inline"}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}

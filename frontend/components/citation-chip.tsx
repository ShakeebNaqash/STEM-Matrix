import { shortBook } from "@/lib/format";
import type { Citation } from "@/lib/types";

export function CitationChip({
  citation,
  onOpen,
}: {
  citation: Citation;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="rounded-full bg-textbook-soft px-2.5 py-1 text-left text-xs font-medium text-textbook hover:opacity-80"
    >
      {shortBook(citation.book)} · p. {citation.page}
    </button>
  );
}

import type { Metadata } from "next";
import { FlashcardScreen } from "@/components/flashcards/flashcard-screen";

export const metadata: Metadata = {
  title: "Flashcards",
};

export default function FlashcardsPage() {
  return <FlashcardScreen />;
}

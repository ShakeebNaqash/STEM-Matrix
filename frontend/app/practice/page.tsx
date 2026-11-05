import type { Metadata } from "next";
import { PracticeScreen } from "@/components/practice/practice-screen";

export const metadata: Metadata = {
  title: "Practice",
};

export default function PracticePage() {
  return <PracticeScreen />;
}

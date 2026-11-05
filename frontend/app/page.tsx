import type { Metadata } from "next";
import { HomePage } from "@/components/landing/home-page";

export const metadata: Metadata = {
  title: { absolute: "StemMatrix" },
  description:
    "On-device STEM study. Textbook passages are cited, numerical answers are solver-checked, and unsourced sentences are labelled Model.",
};

export default function Page() {
  return <HomePage />;
}

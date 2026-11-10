import type { Metadata } from "next";
import localFont from "next/font/local";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";
import { FeedbackSync } from "@/components/feedback-sync";
import { HealthProvider } from "@/components/health-provider";
import { SessionProvider } from "@/components/session-provider";
import "katex/dist/katex.min.css";
import "./globals.css";

const sourceSans = localFont({
  src: [
    { path: "../fonts/source-sans-3-latin-wght-normal.woff2", weight: "200 900", style: "normal" },
    { path: "../fonts/source-sans-3-latin-wght-italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-source",
  display: "swap",
  adjustFontFallback: "Arial",
});

const newsreader = localFont({
  src: [
    { path: "../fonts/newsreader-latin-wght-normal.woff2", weight: "200 800", style: "normal" },
    { path: "../fonts/newsreader-latin-wght-italic.woff2", weight: "200 800", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const plex = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: {
    default: "StemMatrix",
    template: "%s · StemMatrix",
  },
  description:
    "Offline STEM study. Textbook passages are cited, numerical answers are solver-checked, and unsourced sentences are labelled Model.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${newsreader.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="h-dvh overflow-hidden">
        <TooltipProvider>
          <SessionProvider>
            <HealthProvider>
              <FeedbackSync />
              <AppShell>{children}</AppShell>
            </HealthProvider>
          </SessionProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}

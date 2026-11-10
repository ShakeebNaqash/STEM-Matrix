"use client";

import { useEffect } from "react";
import localFont from "next/font/local";
import { ErrorScreen } from "@/components/error-screen";
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

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${newsreader.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="h-dvh overflow-hidden bg-background text-foreground">
        <ErrorScreen retry={retry} />
      </body>
    </html>
  );
}

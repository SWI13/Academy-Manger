import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif, Inter } from "next/font/google";

import { ToastProvider } from "@/components/ui/Toast";

import "./globals.css";

/*
 * Inter, with its optical sizing left on.
 *
 * A management interface is read at two sizes that matter - a dashboard
 * figure and a table row - and a face that adjusts its own contrast between
 * them keeps the small end legible without the large end looking spindly.
 */
const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// For identifiers and money: STU-000042 and 50 000,00 DA both need to line up
// down a column, and a proportional face makes a mistyped digit invisible.
const mono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/*
 * The display face, for the crest and the institute's name.
 *
 * One weight, used in about four places: the monogram, the wordmark and the
 * two headlines on the sign-in screen. A high-contrast serif is what makes a
 * crest read as a crest rather than as an app icon - and confining it to the
 * brand keeps the workspace itself in one voice.
 */
const display = Instrument_Serif({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SM Academy",
  description: "Course and institute management.",
};

export const viewport: Viewport = {
  // The shell is built for 320px upwards; a page that can be pinched is a
  // page nobody has to fight, and blocking that is an accessibility failure.
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d14" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

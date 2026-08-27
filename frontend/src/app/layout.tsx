import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Saira } from "next/font/google";

import { ToastProvider } from "@/components/ui/Toast";

import "./globals.css";

/*
 * Inter, for everything anyone actually reads.
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

/*
 * Saira, for headings, figures and labels.
 *
 * The logo is set in a heavy, squarish, slightly condensed italic - a
 * motorsport voice rather than an academic one. Saira is the closest thing to
 * that voice available as a webfont: technical, tight, and it holds up at
 * 11px in an uppercase label as well as it does at 34px in a page title.
 *
 * Three weights and no italic. The logo may lean; the interface may not, or
 * every heading starts competing with the mark.
 */
const display = Saira({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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

export const metadata: Metadata = {
  title: {
    default: "SM Academy",
    template: "%s · SM Academy",
  },
  description: "Skills today, success tomorrow. Technical and vocational training.",
  icons: {
    // Exported from the official artwork. See public/brand/README.md.
    icon: "/brand/icon.png",
    apple: "/brand/icon.png",
  },
};

export const viewport: Viewport = {
  // The shell is built for 320px upwards; a page that can be pinched is a
  // page nobody has to fight, and blocking that is an accessibility failure.
  width: "device-width",
  initialScale: 1,
  themeColor: "#08090c",
};

/*
 * The effect tier, decided before the first paint.
 *
 * Nine lines of blocking script, which is a real cost and the reason it is
 * this short. It has to run before paint: setting the attribute afterwards
 * would show the expensive version of the page first and then take it away,
 * which is worse than never having offered it.
 *
 * The thresholds are deliberately generous. `deviceMemory` and
 * `hardwareConcurrency` are coarse and Chrome-only, so this errs towards
 * calling a device modest - the lite tier still has every transition, every
 * entrance and the full layout. It gives up blur and ambient movement, which
 * is the part nobody misses on a phone in a workshop.
 */
const FX_TIER = `try{var n=navigator,m=n.deviceMemory,c=n.hardwareConcurrency,s=n.connection&&n.connection.saveData;if(s||(m&&m<=4)||(c&&c<=4))document.documentElement.dataset.fx='lite'}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FX_TIER }} />
      </head>
      <body className="font-sans flex min-h-full flex-col bg-paper">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

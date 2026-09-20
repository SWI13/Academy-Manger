import type { Metadata, Viewport } from "next";
import { Cairo, IBM_Plex_Mono, Inter, Saira } from "next/font/google";

import { LocaleProvider } from "@/components/LocaleProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { LOCALE_INFO, dictFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n.server";

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

/*
 * Cairo, for Arabic.
 *
 * Neither Inter nor Saira has an Arabic glyph between them, so without this
 * an Arabic interface falls back to whatever the operating system offers -
 * which on Windows is Tahoma, and looks like a 2003 control panel.
 *
 * Cairo is the closest Arabic face to the brand's voice: geometric, fairly
 * low contrast, squarish counters, and it carries weight well enough to set a
 * heading in. It covers Latin too, so a course code inside an Arabic sentence
 * does not change typeface mid-line.
 *
 * `preload: false` on purpose. Two readers in three never see a word of
 * Arabic, and preloading would have them fetch the file anyway; the CSS below
 * only names this family under `dir="rtl"`, so nothing else pulls it down.
 */
const arabic = Cairo({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
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
 */
const FX_TIER = `try{var n=navigator,m=n.deviceMemory,c=n.hardwareConcurrency,s=n.connection&&n.connection.saveData;if(s||(m&&m<=4)||(c&&c<=4))document.documentElement.dataset.fx='lite'}catch(e){}`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * The language is settled here, once, before anything renders. `lang` and
   * `dir` on <html> are what make the whole layout mirror and what tell a
   * screen reader which voice to use - neither is something a component
   * further down can fix for itself.
   */
  const locale = await getLocale();
  const { dir } = LOCALE_INFO[locale];

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${body.variable} ${display.variable} ${mono.variable} ${arabic.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FX_TIER }} />
      </head>
      <body className="font-sans flex min-h-full flex-col bg-paper">
        <LocaleProvider locale={locale} dict={dictFor(locale)}>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}

import { LinkButton } from "./Button";
import { getDict } from "@/lib/i18n.server";
import { printHref } from "@/lib/print";

/**
 * The one print control in the platform.
 *
 * Every screen that can be printed uses this, so the button is in the same
 * place, says the same word and behaves the same way on all of them - which
 * is the difference between a feature and fifteen similar features.
 *
 * ---------------------------------------------------------------------------
 * Why the filters travel in the URL
 * ---------------------------------------------------------------------------
 * The toolbar already keeps search, dates, categories and sort order in the
 * query string, because a filtered view is a thing people send to each other.
 * This button copies the ones its screen declares onto the print route, and
 * the print route hands them to the same API the list used.
 *
 * So "print what I am looking at" is not a feature that had to be built - it
 * falls out of the filters already being addressable. The button is a link,
 * which also means middle-click and "open in new tab" work the way a reader
 * expects.
 *
 * A new tab, deliberately: the sheet replaces the whole page, and sending
 * somebody's filtered list away to make them navigate back is a worse trade
 * than one extra tab.
 */
export async function PrintButton({
  href,
  params = {},
  filters = [],
  label,
  variant = "secondary",
}: {
  /** The print route, e.g. "/print/students". */
  href: string;
  /** The current screen's search params. */
  params?: Record<string, string | string[] | undefined>;
  /** Which of them this document understands. */
  filters?: readonly string[];
  /** Overrides the default wording, for a button that prints one record. */
  label?: string;
  variant?: "secondary" | "primary" | "quiet";
}) {
  const d = await getDict();

  return (
    <LinkButton
      href={printHref(href, params, filters)}
      target="_blank"
      rel="noopener"
      icon="printer"
      variant={variant}
      title={d.print.openInNewTab}
    >
      {label ?? d.print.print}
    </LinkButton>
  );
}

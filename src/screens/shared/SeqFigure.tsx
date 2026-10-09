import { accessionDigits, accessionPrefix } from "../../ui";
import { currentLocale } from "../../i18n";

/**
 * Accession number inside a ledger whose header already says "N.º": only the six digits are
 * inked; the prefix stays for screen readers. Rows without a number show an em dash.
 */
export function SeqFigure({ seq }: { seq: number | null | undefined }) {
  if (seq == null) return <span className="figure">—</span>;
  return (
    <span className="figure" data-seq={seq}>
      <span className="visually-hidden">{accessionPrefix(currentLocale())} </span>
      {accessionDigits(seq)}
    </span>
  );
}

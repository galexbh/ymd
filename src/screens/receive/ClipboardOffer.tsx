import { ClipboardPaste } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "../../ui";
import { useClipboard } from "../../store/clipboard";
import s from "./receive.module.css";

/** The quiet line under the counter about a link found on the clipboard. */
export function ClipboardOffer() {
  const { t } = useTranslation();
  const offer = useClipboard((st) => st.offer);
  const { use, undo, dismiss } = useClipboard.getState();

  return (
    <div className={s.clipLine} role="status" data-testid="clipboard-offer">
      {offer && (
        <>
          <Icon icon={ClipboardPaste} size={16} className={s.clipIcon} />
          {offer.kind === "filled" ? (
            <>
              <span className={s.clipText}>
                {t("receive.clipboard.filled", { provider: offer.provider })}
              </span>
              <Button size="sm" variant="ghost" onClick={undo}>
                {t("receive.clipboard.undo")}
              </Button>
            </>
          ) : (
            <>
              <span className={s.clipText}>
                {t("receive.clipboard.suggest", { provider: offer.provider })}
              </span>
              <span className={s.clipUrl} title={offer.url}>
                {offer.url}
              </span>
              <span className={s.clipActions}>
                <Button size="sm" variant="secondary" onClick={use}>
                  {t("receive.clipboard.use")}
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  {t("receive.clipboard.dismiss")}
                </Button>
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}

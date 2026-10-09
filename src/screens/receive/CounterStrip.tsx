import { AudioLines, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MediaKind } from "../../ipc/types";
import { Button, SegmentedControl, Select, UrlField } from "../../ui";
import { looksLikeUrl, useReceive } from "../../store/receive";
import { presetsOfKind, useSettings } from "../../store/settings";
import { presetName } from "../shared/labels";
import { activePreset, ingest, URL_INPUT_ID } from "./ingest";
import s from "./receive.module.css";

/** The counter strip: link, kind, preset and the violet "Ingresar". */
export function CounterStrip() {
  const { t } = useTranslation();
  const settings = useSettings((st) => st.settings);
  const url = useReceive((st) => st.url);
  const kind = useReceive((st) => st.kind);
  const chosen = useReceive((st) => st.presetByKind[kind]);
  const status = useReceive((st) => st.status);
  const probe = useReceive((st) => st.probe);
  const selected = useReceive((st) => st.selected.length);
  const enqueueing = useReceive((st) => st.enqueueing);
  const { setUrl, setKind, setPreset, runProbe, reset } = useReceive.getState();

  const presets = presetsOfKind(settings, kind);
  const preset = activePreset(settings, kind, chosen);
  const emptyPlaylist = status === "ready" && probe?.kind === "playlist" && selected === 0;

  return (
    <div className={s.counterWrap}>
      <form
        className={s.counter}
        aria-label={t("receive.counter")}
        onSubmit={(e) => {
          e.preventDefault();
          void ingest();
        }}
      >
        <UrlField
          id={URL_INPUT_ID}
          data-testid="home-url-input"
          fieldClassName={s.url}
          value={url}
          busy={status === "loading"}
          onValueChange={setUrl}
          onPasteText={(text) => {
            if (looksLikeUrl(text)) void runProbe(text);
          }}
          onClear={reset}
        />
        <SegmentedControl<MediaKind>
          label={t("receive.kind")}
          size="lg"
          value={kind}
          onChange={setKind}
          options={[
            { value: "video", label: t("receive.video"), icon: Video },
            { value: "audio", label: t("receive.audio"), icon: AudioLines },
          ]}
        />
        <Select
          label={t("receive.preset")}
          hideLabel
          size="lg"
          fieldClassName={s.preset}
          data-testid="home-preset"
          value={preset?.id ?? ""}
          onChange={(e) => setPreset(kind, e.target.value)}
          options={presets.map((p) => ({ value: p.id, label: presetName(t, p) }))}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={enqueueing}
          disabled={!url.trim() || emptyPlaylist || !settings}
          data-testid="home-ingest"
        >
          {t("receive.ingest")}
        </Button>
      </form>
    </div>
  );
}

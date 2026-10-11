import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlaylistEntry, ProbeResult } from "../../ipc/types";
import { Button, DurationFigure, Figure, ThumbCell } from "../../ui";
import { selectedDuration, useReceive } from "../../store/receive";
import s from "./receive.module.css";

/** Stamp-size grid of playlist entries; selected ones are circled in ink. Memoized: only the
 * probe or the selection re-render it, and then only the cells whose selection changed. */
export const PlaylistPicker = memo(function PlaylistPicker({ probe }: { probe: ProbeResult }) {
  const { t } = useTranslation();
  const selected = useReceive((st) => st.selected);
  const { toggle, selectAll, selectNone, selectRange } = useReceive.getState();
  const shift = useRef(false);
  const count = probe.entries.length;
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(String(count));
  const sel = useMemo(() => new Set(selected), [selected]);
  const onToggle = useCallback(
    (index: number, on: boolean) => {
      toggle(index, on, shift.current);
      shift.current = false;
    },
    [toggle],
  );

  const applyRange = () => {
    const a = Number.parseInt(from, 10);
    const b = Number.parseInt(to, 10);
    if (Number.isFinite(a) && Number.isFinite(b)) selectRange(a, b);
  };

  return (
    <section className={s.picker} aria-label={t("receive.picker.label")}>
      <div className={s.pickerBar}>
        <p className={s.pickerCount} aria-live="polite" data-testid="picker-count">
          {t("receive.picker.selected")} <Figure value={`${selected.length}/${count}`} />
          <span className={s.dot} aria-hidden="true">
            ·
          </span>
          <DurationFigure seconds={selectedDuration(probe, selected)} />
        </p>
        <div className={s.pickerTools}>
          <Button size="sm" variant="ghost" onClick={selectAll}>
            {t("receive.picker.all")}
          </Button>
          <Button size="sm" variant="ghost" onClick={selectNone}>
            {t("receive.picker.none")}
          </Button>
          <span className={s.range}>
            <label>
              <span className={s.rangeLabel}>{t("receive.picker.from")}</span>
              <input
                className={s.rangeInput}
                inputMode="numeric"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label={t("receive.picker.fromLabel")}
              />
            </label>
            <label>
              <span className={s.rangeLabel}>{t("receive.picker.to")}</span>
              <input
                className={s.rangeInput}
                inputMode="numeric"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label={t("receive.picker.toLabel")}
              />
            </label>
            <Button size="sm" variant="secondary" onClick={applyRange}>
              {t("receive.picker.applyRange")}
            </Button>
          </span>
        </div>
      </div>
      <p className={s.pickerHint}>{t("receive.picker.shiftHint")}</p>
      <div
        className={s.grid}
        onClickCapture={(e) => {
          shift.current = e.shiftKey;
        }}
        onKeyDownCapture={(e) => {
          shift.current = e.shiftKey;
        }}
      >
        {probe.entries.map((e) => (
          <PickerCell key={e.index} entry={e} selected={sel.has(e.index)} onToggle={onToggle} />
        ))}
      </div>
      {selected.length === 0 && <p className={s.pickerWarn}>{t("receive.picker.noneWarn")}</p>}
    </section>
  );
});

const PickerCell = memo(function PickerCell({
  entry,
  selected,
  onToggle,
}: {
  entry: PlaylistEntry;
  selected: boolean;
  onToggle: (index: number, on: boolean) => void;
}) {
  return (
    <ThumbCell
      seq={entry.index}
      title={entry.title}
      thumbnail={entry.thumbnail}
      duration={entry.duration}
      selected={selected}
      onSelectedChange={(on) => onToggle(entry.index, on)}
    />
  );
});

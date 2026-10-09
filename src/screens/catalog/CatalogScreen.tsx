import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  Library,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HistoryItem, MediaKind } from "../../ipc/types";
import {
  BytesFigure,
  Button,
  Dialog,
  EmptyState,
  ErrorNotice,
  Figure,
  IconButton,
  Ledger,
  LedgerBody,
  LedgerCell,
  LedgerHead,
  LedgerHeaderCell,
  LedgerRow,
  SegmentedControl,
  Skeleton,
  Tag,
  TextField,
  Thumb,
  Tooltip,
  formatStampDate,
} from "../../ui";
import { currentLocale } from "../../i18n";
import { openFile, showInFolder } from "../../app/native";
import { PAGE_SIZE, useHistory } from "../../store/history";
import { useNav } from "../../store/nav";
import { useReceive } from "../../store/receive";
import { ScreenHeader } from "../shared/ScreenHeader";
import { historyPresetName } from "../shared/labels";
import { SeqFigure } from "../shared/SeqFigure";
import screen from "../shared/screen.module.css";
import { focusUrlField } from "../receive/ingest";
import s from "./catalog.module.css";

type KindFilter = "all" | MediaKind;

export function CatalogScreen() {
  const { t } = useTranslation();
  const h = useHistory();
  const [query, setQuery] = useState(h.search);
  const [confirm, setConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    void useHistory.getState().refresh();
  }, []);

  // debounce the search box
  useEffect(() => {
    if (query === useHistory.getState().search) return;
    const id = setTimeout(() => useHistory.getState().setSearch(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  const filtered = !!h.search.trim() || h.kind !== null;
  const first = h.page * PAGE_SIZE;
  const last = Math.min(h.total, first + h.items.length);

  return (
    <div className={screen.screen}>
      <ScreenHeader
        title={t("nav.catalog")}
        description={t("catalog.description")}
        actions={
          <Button
            variant="ghost"
            leadingIcon={Trash2}
            disabled={h.total === 0 && !filtered}
            onClick={() => setConfirm(true)}
          >
            {t("catalog.clearAll")}
          </Button>
        }
      />

      <div className={screen.toolbar}>
        <TextField
          fieldClassName={screen.grow}
          label={t("catalog.search")}
          hideLabel
          type="search"
          leadingIcon={Search}
          placeholder={t("catalog.searchPlaceholder")}
          value={query}
          data-testid="catalog-search"
          onChange={(e) => setQuery(e.target.value)}
        />
        <SegmentedControl<KindFilter>
          label={t("catalog.kind")}
          value={h.kind ?? "all"}
          onChange={(k) => h.setKind(k === "all" ? null : k)}
          options={[
            { value: "all", label: t("catalog.kinds.all") },
            { value: "video", label: t("receive.video") },
            { value: "audio", label: t("receive.audio") },
          ]}
        />
      </div>

      {h.status === "error" && h.error && (
        <ErrorNotice
          code={h.error.code}
          detail={h.error.detail}
          actions={[{ label: t("common.retry"), primary: true, onClick: () => void h.refresh() }]}
        />
      )}

      {(h.status === "idle" || h.status === "loading") && h.items.length === 0 ? (
        <Skeleton count={6} columns={[10, 44, 12, 8, 10]} />
      ) : h.items.length === 0 && h.status === "ready" ? (
        filtered ? (
          <EmptyState icon={SearchX} title={t("catalog.noResults.title")}>
            <p>{t("catalog.noResults.body")}</p>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Library}
            title={t("catalog.empty.title")}
            actions={
              <Button
                variant="secondary"
                onClick={() => {
                  useNav.getState().navigate("receive");
                  focusUrlField();
                }}
              >
                {t("catalog.empty.action")}
              </Button>
            }
          >
            <p>{t("catalog.empty.body")}</p>
          </EmptyState>
        )
      ) : (
        h.items.length > 0 && (
          <>
            <Ledger caption={t("nav.catalog")} data-testid="catalog-ledger">
              <LedgerHead>
                <tr>
                  <LedgerHeaderCell className={s.cSeq}>{t("ledger.col.seq")}</LedgerHeaderCell>
                  <LedgerHeaderCell className={s.cDate}>{t("catalog.col.date")}</LedgerHeaderCell>
                  <LedgerHeaderCell>{t("catalog.col.title")}</LedgerHeaderCell>
                  <LedgerHeaderCell className={s.cPreset}>
                    {t("catalog.col.preset")}
                  </LedgerHeaderCell>
                  <LedgerHeaderCell numeric className={s.cSize}>
                    {t("catalog.col.size")}
                  </LedgerHeaderCell>
                  <LedgerHeaderCell className={s.cActions}>
                    <span className="visually-hidden">{t("ledger.col.actions")}</span>
                  </LedgerHeaderCell>
                </tr>
              </LedgerHead>
              <LedgerBody>
                {h.items.map((item) => (
                  <CatalogRow key={item.id} item={item} />
                ))}
              </LedgerBody>
            </Ledger>
            <nav className={s.pager} aria-label={t("catalog.pages")}>
              <span className={screen.muted}>
                <Figure value={`${first + 1}–${last}`} /> {t("catalog.of")}{" "}
                <Figure value={h.total} />
              </span>
              <IconButton
                icon={ChevronLeft}
                aria-label={t("catalog.prev")}
                disabled={h.page === 0}
                onClick={() => h.setPage(h.page - 1)}
              />
              <IconButton
                icon={ChevronRight}
                aria-label={t("catalog.next")}
                disabled={last >= h.total}
                onClick={() => h.setPage(h.page + 1)}
              />
            </nav>
          </>
        )
      )}

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("catalog.confirm.title")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              loading={clearing}
              onClick={async () => {
                setClearing(true);
                try {
                  await useHistory.getState().clearAll();
                } finally {
                  setClearing(false);
                  setConfirm(false);
                }
              }}
            >
              {t("catalog.confirm.action")}
            </Button>
          </>
        }
      >
        <p>{t("catalog.confirm.body")}</p>
      </Dialog>
    </div>
  );
}

function CatalogRow({ item }: { item: HistoryItem }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const redownload = () => {
    useNav.getState().navigate("receive");
    const rx = useReceive.getState();
    rx.setKind(item.kind);
    rx.setUrl(item.url);
    void rx.runProbe(item.url);
  };
  return (
    <LedgerRow tone={item.exists ? undefined : "muted"} data-testid={`catalog-row-${item.id}`}>
      <LedgerCell className={s.cSeq}>
        <SeqFigure seq={item.seq} />
      </LedgerCell>
      <LedgerCell className={s.cDate}>
        <Figure value={formatStampDate(item.completedAt, locale)} muted />
      </LedgerCell>
      <LedgerCell>
        <div className={s.titleCell}>
          <Thumb src={item.thumbnail} width="3.5rem" />
          <div className={s.titleText}>
            <span className={item.exists ? s.title : s.titleGone} title={item.title}>
              {item.title}
            </span>
            {item.exists ? (
              <span className={s.file} title={item.filepath}>
                {item.filepath}
              </span>
            ) : (
              <span className={s.gone}>{t("catalog.missing")}</span>
            )}
          </div>
        </div>
      </LedgerCell>
      <LedgerCell className={s.cPreset}>
        <Tag>{historyPresetName(t, item)}</Tag>
      </LedgerCell>
      <LedgerCell numeric className={s.cSize}>
        <BytesFigure bytes={item.size} muted={!item.exists} />
      </LedgerCell>
      <LedgerCell>
        <div className={screen.actionsCell}>
          {item.exists && (
            <>
              <Tooltip content={t("ledger.action.open")}>
                <IconButton
                  icon={ExternalLink}
                  size="sm"
                  aria-label={t("ledger.action.openNamed", { title: item.title })}
                  onClick={() => void openFile(item.filepath).catch(() => {})}
                />
              </Tooltip>
              <Tooltip content={t("ledger.action.reveal")}>
                <IconButton
                  icon={FolderOpen}
                  size="sm"
                  aria-label={t("ledger.action.revealNamed", { title: item.title })}
                  onClick={() => void showInFolder(item.filepath).catch(() => {})}
                />
              </Tooltip>
            </>
          )}
          <Tooltip content={t("catalog.redownload")}>
            <IconButton
              icon={Download}
              size="sm"
              aria-label={t("catalog.redownloadNamed", { title: item.title })}
              onClick={redownload}
            />
          </Tooltip>
          <Tooltip content={t("catalog.delete")}>
            <IconButton
              icon={Trash2}
              size="sm"
              aria-label={t("catalog.deleteNamed", { title: item.title })}
              onClick={() => void useHistory.getState().remove(item.id)}
            />
          </Tooltip>
        </div>
      </LedgerCell>
    </LedgerRow>
  );
}

// Dev-only gallery: every primitive in every state, light and dark side by side.
// Reachable at ?gallery (both themes), ?gallery=light or ?gallery=dark.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  Archive,
  AudioLines,
  Download,
  FolderOpen,
  Inbox,
  Link2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import "../styles/base.css";
import type { JobStage } from "../ipc/types";
import { setupI18n, setLanguage, currentLocale } from "../i18n";
import {
  CURATED_ACCENTS,
  contrastRatio,
  deriveAccent,
  THEME_SURFACES,
  type ResolvedTheme,
} from "../theme/accent";
import {
  Accession,
  Button,
  BytesFigure,
  Checkbox,
  Dialog,
  DurationFigure,
  EmptyState,
  ErrorNotice,
  EtaFigure,
  Figure,
  IconButton,
  Kbd,
  Ledger,
  LedgerBody,
  LedgerCell,
  LedgerHead,
  LedgerHeaderCell,
  LedgerRow,
  LedgerSpan,
  Notice,
  Panel,
  ProgressDeterminate,
  Section,
  SegmentedControl,
  Select,
  Skeleton,
  SpeedFigure,
  Stamp,
  StageLine,
  Switch,
  Tag,
  TextField,
  ThumbCell,
  ToastRegion,
  Tooltip,
  UrlField,
  useToasts,
  formatPercent,
} from "../ui";

setupI18n("es");

const STAGES: JobStage[] = [
  "queued",
  "downloading",
  "merging",
  "postprocessing",
  "done",
  "error",
  "canceled",
];
const STATES = ["default", "hover", "focus", "active"] as const;

const MiB = 1024 * 1024;

function thumb(hue: number, seed: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'><rect width='160' height='90' fill='hsl(${hue} 22% 34%)'/><circle cx='${40 + (seed % 5) * 18}' cy='30' r='14' fill='hsl(${hue + 30} 40% 70%)'/><path d='M0 90 L${50 + seed * 7} 48 L110 90Z' fill='hsl(${hue} 18% 22%)'/><path d='M60 90 L${118 - seed * 3} 40 L160 76 L160 90Z' fill='hsl(${hue - 20} 20% 46%)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface Row {
  seq: number;
  title: string;
  format: string;
  total: number | null;
  done: number | null;
  speed: number | null;
  eta: number | null;
  stage: JobStage;
}

const ROWS: Row[] = [
  {
    seq: 128,
    title: "Concierto completo en el Teatro Nacional — grabación 2019",
    format: "MP4 · 1080p",
    total: 1.42 * 1024 * MiB,
    done: 0.61 * 1024 * MiB,
    speed: 8.4 * MiB,
    eta: 97,
    stage: "downloading",
  },
  {
    seq: 127,
    title: "Entrevista: el oficio de restaurar mapas antiguos",
    format: "MKV · 720p",
    total: 412 * MiB,
    done: 412 * MiB,
    speed: null,
    eta: null,
    stage: "merging",
  },
  {
    seq: 126,
    title: "Lista de reproducción · Música para leer (14 de 32)",
    format: "OPUS",
    total: null,
    done: 3.1 * MiB,
    speed: 1.2 * MiB,
    eta: null,
    stage: "downloading",
  },
  {
    seq: 125,
    title: "Taller de encuadernación japonesa, parte 2",
    format: "MP4 · 1440p",
    total: 2.05 * 1024 * MiB,
    done: 2.05 * 1024 * MiB,
    speed: null,
    eta: null,
    stage: "done",
  },
  {
    seq: 124,
    title: "Clase abierta de armonía (sesión privada)",
    format: "M4A",
    total: 88 * MiB,
    done: 12.4 * MiB,
    speed: null,
    eta: null,
    stage: "error",
  },
  {
    seq: 123,
    title: "Documental sobre faros del Atlántico norte",
    format: "MP4 · 2160p",
    total: 6.8 * 1024 * MiB,
    done: 0.4 * 1024 * MiB,
    speed: null,
    eta: null,
    stage: "canceled",
  },
  {
    seq: 129,
    title: "Podcast semanal — episodio 212",
    format: "MP3 · 320K",
    total: null,
    done: null,
    speed: null,
    eta: null,
    stage: "queued",
  },
];

const label: CSSProperties = {
  fontSize: "var(--text-2xs)",
  color: "var(--text-muted)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
  fontWeight: 600,
};

function Cell({
  name,
  children,
  style,
}: {
  name: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        minWidth: 0,
        ...style,
      }}
    >
      <span style={label}>{name}</span>
      <div
        style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}
      >
        {children}
      </div>
    </div>
  );
}

const grid = (min: string): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))`,
  gap: "var(--space-5) var(--space-4)",
  alignItems: "start",
});

function CounterStrip() {
  const [url, setUrl] = useState("https://www.example.org/watch?v=archivo-0128");
  const [kind, setKind] = useState<"video" | "audio">("video");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
        gap: "var(--space-3)",
        alignItems: "end",
      }}
    >
      <UrlField value={url} onValueChange={setUrl} onPasteText={() => {}} />
      <SegmentedControl
        label="Tipo"
        size="lg"
        value={kind}
        onChange={setKind}
        options={[
          { value: "video", label: "Video", icon: Video },
          { value: "audio", label: "Audio", icon: AudioLines },
        ]}
      />
      <Select
        label="Preajuste"
        hideLabel
        defaultValue="best"
        options={[
          { value: "best", label: "Mejor calidad · MP4" },
          { value: "1080", label: "1080p · MP4" },
          { value: "mp3", label: "Audio · MP3 320K" },
        ]}
        size="lg"
      />
      <Button variant="primary" size="lg" leadingIcon={Download}>
        Ingresar
      </Button>
    </div>
  );
}

function Column({ theme }: { theme: ResolvedTheme }) {
  const [sw, setSw] = useState(true);
  const [cb, setCb] = useState(true);
  const [seg, setSeg] = useState<"video" | "audio">("audio");
  const [sel, setSel] = useState<Record<number, boolean>>({ 1: true, 3: true });
  const [strikeStage, setStrikeStage] = useState<JobStage>("postprocessing");
  const [dialog, setDialog] = useState(false);
  const [custom, setCustom] = useState("#d4e000");
  const push = useToasts((s) => s.push);
  const locale = currentLocale();

  const derivedCustom = /^#[0-9a-f]{6}$/i.test(custom) ? deriveAccent(custom, theme) : null;

  return (
    <div
      data-theme={theme}
      data-density="comfortable"
      data-radius="soft"
      style={{
        background: "var(--surface)",
        color: "var(--text)",
        padding: "var(--space-8) var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-10)",
        minWidth: 0,
        flex: 1,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--space-4)",
        }}
      >
        <h1 style={{ fontSize: "var(--text-2xl)" }}>
          ymd · {theme === "light" ? "Claro" : "Oscuro"}
        </h1>
        <span className="figure" style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          {formatPercent(0.375, locale)} · <Accession seq={128} />
        </span>
      </header>

      <Section title="Mostrador">
        <CounterStrip />
      </Section>

      <Section title="Botones">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "6rem repeat(6, auto)",
            gap: "var(--space-3)",
            alignItems: "center",
            justifyContent: "start",
          }}
        >
          <span />
          {[...STATES, "disabled", "loading"].map((st) => (
            <span key={st} style={label}>
              {st}
            </span>
          ))}
          {(["primary", "secondary", "ghost", "danger"] as const).map((v) => (
            <Row4 key={v} name={v}>
              {STATES.map((st) => (
                <Button key={st} variant={v} data-demo-state={st === "default" ? undefined : st}>
                  {v === "danger" ? "Eliminar" : "Ingresar"}
                </Button>
              ))}
              <Button variant={v} disabled>
                Ingresar
              </Button>
              <Button variant={v} loading>
                Ingresar
              </Button>
            </Row4>
          ))}
        </div>
        <div
          style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}
        >
          <Button size="sm" variant="secondary" leadingIcon={FolderOpen}>
            Abrir carpeta
          </Button>
          <Button size="md" variant="secondary" leadingIcon={RotateCcw}>
            Reintentar
          </Button>
          <Button size="lg" variant="primary" leadingIcon={Plus}>
            Instalar recomendadas
          </Button>
          <IconButton icon={FolderOpen} aria-label="Abrir carpeta" />
          <IconButton icon={RotateCcw} aria-label="Reintentar" data-demo-state="hover" />
          <IconButton icon={Trash2} aria-label="Quitar" variant="secondary" />
          <IconButton icon={Trash2} aria-label="Quitar" variant="danger" />
          <IconButton icon={Archive} aria-label="Archivar" variant="primary" />
          <IconButton icon={Archive} aria-label="Archivar" disabled />
          <IconButton icon={Archive} aria-label="Archivar" loading variant="secondary" />
        </div>
      </Section>

      <Section title="Campos">
        <div style={grid("15rem")}>
          <TextField
            label="Nombre del preajuste"
            defaultValue="Música para leer"
            hint="Aparece en el mostrador."
          />
          <TextField
            label="Buscar en el catálogo"
            leadingIcon={Search}
            placeholder="Título, sitio o carpeta"
            data-demo-state="hover"
          />
          <TextField
            label="Plantilla de nombre"
            mono
            defaultValue="%(title)s [%(id)s].%(ext)s"
            data-demo-state="focus"
          />
          <TextField label="Idiomas de subtítulos" optional defaultValue="es.*,en" />
          <TextField
            label="Carpeta de destino"
            mono
            defaultValue="D:\\Música\\ymd"
            error="No hay permiso para escribir en esta carpeta."
          />
          <TextField
            label="Contraseña del video"
            type="password"
            disabled
            placeholder="Se pide en cada descarga"
          />
          <Select
            label="Contenedor"
            defaultValue="mp4"
            options={[
              { value: "mp4", label: "MP4" },
              { value: "mkv", label: "MKV" },
              { value: "webm", label: "WebM" },
            ]}
            hint="MP4 es el más compatible."
          />
          <Select
            label="Canal de yt-dlp"
            defaultValue="stable"
            disabled
            options={[{ value: "stable", label: "Estable" }]}
          />
          <Select
            label="Navegador"
            defaultValue=""
            error="Elige un navegador para usar sus cookies."
            options={[
              { value: "", label: "Ninguno" },
              { value: "brave", label: "Brave" },
            ]}
          />
        </div>
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <UrlFieldDemo />
        </div>
      </Section>

      <Section title="Elecciones">
        <div style={grid("14rem")}>
          <Cell name="segmented">
            <SegmentedControl
              label="Tipo"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "video", label: "Video", icon: Video },
                { value: "audio", label: "Audio", icon: AudioLines },
              ]}
            />
          </Cell>
          <Cell name="segmented disabled">
            <SegmentedControl
              label="Tipo"
              value="video"
              onChange={() => {}}
              disabled
              options={[
                { value: "video", label: "Video" },
                { value: "audio", label: "Audio" },
              ]}
            />
          </Cell>
          <Cell name="switch">
            <Switch
              checked={sw}
              onChange={setSw}
              label="Actualizar yt-dlp solo"
              description="Revisa una vez al día."
            />
          </Cell>
          <Cell name="switch states">
            <Switch
              checked={false}
              onChange={() => {}}
              label="Usar aria2c"
              data-demo-state="hover"
            />
            <Switch checked disabled onChange={() => {}} label="Bloqueado" />
          </Cell>
          <Cell name="checkbox">
            <Checkbox checked={cb} onCheckedChange={setCb} label="Incrustar miniatura" />
            <Checkbox checked={false} onCheckedChange={() => {}} label="Incrustar subtítulos" />
          </Cell>
          <Cell name="checkbox states">
            <Checkbox
              checked={false}
              indeterminate
              onCheckedChange={() => {}}
              label="Seleccionar todo"
            />
            <Checkbox checked={false} invalid onCheckedChange={() => {}} label="Acepto" />
            <Checkbox checked disabled onCheckedChange={() => {}} label="Metadatos" />
          </Cell>
        </div>
      </Section>

      <Section
        title="Sellos"
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStrikeStage((s) => (s === "done" ? "postprocessing" : "done"))}
          >
            {strikeStage === "done" ? "Restablecer" : "Archivar (sello)"}
          </Button>
        }
      >
        <div
          style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}
        >
          {STAGES.map((st) => (
            <Stamp key={st} stage={st} />
          ))}
        </div>
        <div
          style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}
        >
          {STAGES.map((st) => (
            <Stamp key={st} stage={st} size="sm" />
          ))}
          <Stamp stage="done" size="lg" />
          <Stamp stage="error" size="lg" />
          <span style={{ ...label, marginInlineStart: "var(--space-4)" }}>golpe →</span>
          <Stamp stage={strikeStage} size="lg" />
        </div>
      </Section>

      <Section title="Trazo de avance">
        <div style={grid("13rem")}>
          <Cell name="0 %" style={{ alignItems: "stretch" }}>
            <LedgerSpan value={0} max={100} />
          </Cell>
          <Cell name="37,5 %">
            <LedgerSpan value={375} max={1000} />
          </Cell>
          <Cell name="total desconocido">
            <LedgerSpan value={3 * MiB} max={null} />
          </Cell>
          <Cell name="uniendo">
            <LedgerSpan value={1} max={1} stage="merging" />
          </Cell>
          <Cell name="fallido">
            <LedgerSpan value={14} max={100} stage="error" />
          </Cell>
          <Cell name="anulado">
            <LedgerSpan value={6} max={100} stage="canceled" />
          </Cell>
        </div>
        <div style={grid("18rem")}>
          {(["queued", "downloading", "postprocessing", "done", "error"] as JobStage[]).map(
            (st) => (
              <Cell key={st} name={`etapas · ${st}`} style={{ alignItems: "stretch" }}>
                <StageLine stage={st} failedAt="downloading" />
              </Cell>
            ),
          )}
        </div>
        <div style={grid("18rem")}>
          <ProgressDeterminate
            label="ffmpeg 7.1 · descargando"
            value={41.2 * MiB}
            max={88.6 * MiB}
          />
          <ProgressDeterminate label="Deno 2.4 · verificando" value={null} max={null} />
          <ProgressDeterminate
            label="yt-dlp · falló la suma de verificación"
            value={9.4 * MiB}
            max={17.8 * MiB}
            failed
          />
        </div>
      </Section>

      <Section title="Cifras">
        <div style={grid("9rem")}>
          <Cell name="tamaño">
            <BytesFigure bytes={1.42 * 1024 * MiB} />
          </Cell>
          <Cell name="velocidad">
            <SpeedFigure bytesPerSecond={8.4 * MiB} />
          </Cell>
          <Cell name="restante">
            <EtaFigure seconds={97} />
          </Cell>
          <Cell name="duración">
            <DurationFigure seconds={4021} />
          </Cell>
          <Cell name="n.º">
            <Accession seq={128} />
          </Cell>
          <Cell name="porcentaje">
            <Figure value={formatPercent(0.618, locale)} muted />
          </Cell>
        </div>
      </Section>

      <Section
        title="Libro de registro"
        description="Cada fila es un ingreso. Las cifras se alinean por columna."
      >
        <Ledger
          caption="Cola de descargas"
          columns={["6.5rem", "auto", "7.5rem", "6rem", "9rem", "6.5rem", "4.5rem", "8rem"]}
        >
          <LedgerHead>
            <tr>
              <LedgerHeaderCell>N.º</LedgerHeaderCell>
              <LedgerHeaderCell>Título</LedgerHeaderCell>
              <LedgerHeaderCell>Formato</LedgerHeaderCell>
              <LedgerHeaderCell numeric>Tamaño</LedgerHeaderCell>
              <LedgerHeaderCell>Avance</LedgerHeaderCell>
              <LedgerHeaderCell numeric>Velocidad</LedgerHeaderCell>
              <LedgerHeaderCell numeric>Resta</LedgerHeaderCell>
              <LedgerHeaderCell center>Estado</LedgerHeaderCell>
            </tr>
          </LedgerHead>
          <LedgerBody>
            {ROWS.map((r, i) => (
              <LedgerRow
                key={r.seq}
                interactive
                selected={i === 1}
                data-demo-state={i === 3 ? "hover" : undefined}
                tone={r.stage === "canceled" ? "muted" : undefined}
              >
                <LedgerCell>
                  <Accession seq={r.seq} />
                </LedgerCell>
                <LedgerCell truncate title={r.title}>
                  {r.title}
                </LedgerCell>
                <LedgerCell>
                  <Tag mono>{r.format}</Tag>
                </LedgerCell>
                <LedgerCell numeric>
                  <BytesFigure bytes={r.total ?? r.done} />
                </LedgerCell>
                <LedgerCell>
                  <LedgerSpan value={r.done} max={r.total} stage={r.stage} />
                </LedgerCell>
                <LedgerCell numeric muted>
                  {r.speed ? <SpeedFigure bytesPerSecond={r.speed} /> : "—"}
                </LedgerCell>
                <LedgerCell numeric muted>
                  {r.stage === "downloading" ? <EtaFigure seconds={r.eta} /> : "—"}
                </LedgerCell>
                <LedgerCell center>
                  <Stamp stage={r.stage} size="sm" />
                </LedgerCell>
              </LedgerRow>
            ))}
          </LedgerBody>
        </Ledger>
      </Section>

      <Section title="Selector de lista">
        <div style={grid("9.5rem")}>
          {[
            { i: 1, t: "Preludio en mi menor", d: 184 },
            { i: 2, t: "Nocturno para piano solo, interpretación de archivo", d: 402 },
            { i: 3, t: "Estudio sobre una melodía popular", d: 233 },
            { i: 4, t: "Sin miniatura disponible", d: 95, noImg: true },
            { i: 5, t: "Entrada no disponible", d: null, disabled: true },
            { i: 6, t: "Variaciones (hover)", d: 1210, demo: "hover" },
            { i: 7, t: "Variaciones (foco)", d: 618, demo: "focus" },
          ].map((e) => (
            <ThumbCell
              key={e.i}
              seq={e.i}
              title={e.t}
              thumbnail={e.noImg ? null : thumb(200 + e.i * 23, e.i)}
              duration={e.d}
              selected={!!sel[e.i]}
              disabled={e.disabled}
              data-demo-state={e.demo}
              onSelectedChange={(v) => setSel((s) => ({ ...s, [e.i]: v }))}
            />
          ))}
        </div>
      </Section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(12rem, 14rem) 1fr",
          gap: "var(--space-6)",
          alignItems: "start",
        }}
      >
        <Panel as="aside" aria-label="Estante">
          <span style={label}>Panel · estante</span>
          <Button variant="ghost" leadingIcon={Inbox} style={{ justifyContent: "flex-start" }}>
            Mostrador
          </Button>
          <Button
            variant="ghost"
            leadingIcon={Archive}
            style={{ justifyContent: "flex-start" }}
            data-demo-state="hover"
          >
            Catálogo
          </Button>
        </Panel>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <EmptyState
            icon={Link2}
            title="La cola está vacía"
            actions={
              <>
                <Kbd>Ctrl</Kbd> <Kbd>V</Kbd>
                <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
                  pega un enlace en cualquier momento
                </span>
              </>
            }
          >
            Pega un enlace en el mostrador y elige Video o Audio. Cada descarga recibe un número de
            ingreso y aparece aquí con su avance exacto.
          </EmptyState>
          <Skeleton count={3} />
          <Skeleton variant="text" count={3} />
        </div>
      </div>

      <Section title="Avisos">
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <Notice
            tone="info"
            title="Hay una versión nueva de yt-dlp"
            actions={[{ label: "Actualizar", onClick: () => {}, primary: true }]}
            onDismiss={() => {}}
          >
            2026.10.02 corrige descargas de varios sitios.
          </Notice>
          <Notice tone="success" title="Dependencias listas">
            yt-dlp, ffmpeg y Deno están instalados y verificados.
          </Notice>
          <Notice tone="warning" title="Brave está abierto">
            Ciérralo antes de leer sus cookies, o usa una copia.
          </Notice>
          <ErrorNotice
            code="bot_check"
            detail="ERROR: [youtube] abc123: Sign in to confirm you’re not a bot."
            actions={[
              { label: "Abrir Cuentas", onClick: () => {}, primary: true },
              { label: "Reintentar", onClick: () => {} },
            ]}
          />
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <Button
              onClick={() =>
                push({
                  tone: "success",
                  title: "Archivado N.º 000125",
                  body: "Taller de encuadernación japonesa, parte 2",
                  actions: [{ label: "Abrir carpeta", onClick: () => {} }],
                })
              }
            >
              Mostrar aviso flotante
            </Button>
            <Button onClick={() => setDialog(true)}>Abrir diálogo</Button>
            <Tooltip content="Copia el detalle técnico para reportarlo." data-demo-state="open">
              <Button variant="ghost">Con tooltip</Button>
            </Tooltip>
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap",
              marginTop: "var(--space-6)",
            }}
          >
            <Tag>Recomendada</Tag>
            <Tag tone="accent">Predeterminado</Tag>
            <Tag tone="warning">Actualización</Tag>
            <Tag tone="danger">Falta</Tag>
            <Tag mono>v2026.10.02</Tag>
          </div>
        </div>
      </Section>

      <Section title="Acento">
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {CURATED_ACCENTS.map((a) => {
            const d = deriveAccent(a.hex, theme);
            return (
              <div
                key={a.id}
                style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}
              >
                <span
                  style={{
                    width: 40,
                    height: 28,
                    background: d.accent,
                    borderRadius: "var(--radius-sm)",
                    display: "grid",
                    placeItems: "center",
                    color: d.onAccent,
                    fontSize: "var(--text-2xs)",
                    fontWeight: 700,
                  }}
                >
                  Aa
                </span>
                <span
                  className="figure"
                  style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}
                >
                  {contrastRatio(d.accent, THEME_SURFACES[theme].surface).toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
        <div
          style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", flexWrap: "wrap" }}
        >
          <TextField
            label="Color personalizado"
            mono
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            fieldClassName=""
            style={{ width: "8rem" }}
          />
          {derivedCustom && (
            <>
              <span
                style={{
                  width: 40,
                  height: "var(--control-h)",
                  background: derivedCustom.accent,
                  borderRadius: "var(--radius-sm)",
                }}
              />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                {derivedCustom.adjusted
                  ? "Ajustamos el tono para que se lea bien."
                  : "Se lee bien tal cual."}
              </span>
            </>
          )}
        </div>
      </Section>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="¿Quitar ffmpeg?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => setDialog(false)}>
              Quitar
            </Button>
          </>
        }
      >
        <p>
          Las descargas que unen video y audio dejarán de funcionar hasta que lo vuelvas a instalar.
        </p>
      </Dialog>
    </div>
  );
}

function Row4({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <span style={label}>{name}</span>
      {children}
    </>
  );
}

function UrlFieldDemo() {
  const [a, setA] = useState("");
  const [b, setB] = useState("https://www.example.org/playlist?list=lectura-32");
  const [c, setC] = useState("ftp://ejemplo");
  return (
    <>
      <UrlField
        value={a}
        onValueChange={setA}
        onPasteText={() => {}}
        label="Enlace (vacío)"
        hint="Pega con Ctrl+V; se revisa al instante."
      />
      <UrlField value={b} onValueChange={setB} busy label="Enlace (revisando)" />
      <UrlField
        value={c}
        onValueChange={setC}
        label="Enlace (error)"
        error="Este enlace no es compatible. Comprueba que sea la dirección de un video o una lista."
      />
    </>
  );
}

export default function Gallery() {
  const param =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("gallery")
      : null;
  const only: ResolvedTheme | null = param === "light" || param === "dark" ? param : null;
  const [lang, setLang] = useState<"es" | "en">("es");

  useEffect(() => {
    document.documentElement.dataset.theme = only ?? "light";
    document.title = "ymd · gallery";
  }, [only]);

  return (
    <div key={lang} style={{ minHeight: "100vh", background: "var(--surface)" }}>
      <div
        data-theme={only ?? "light"}
        style={{ position: "fixed", bottom: 12, left: 12, zIndex: 100, display: "flex", gap: 8 }}
      >
        <SegmentedControl
          label="Idioma"
          value={lang}
          onChange={(l) => {
            setLanguage(l);
            setLang(l);
          }}
          options={[
            { value: "es", label: "ES" },
            { value: "en", label: "EN" },
          ]}
        />
      </div>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {(only ? [only] : (["light", "dark"] as ResolvedTheme[])).map((t) => (
          <Column key={t} theme={t} />
        ))}
      </div>
      <div data-theme={only ?? "light"}>
        <ToastRegion />
      </div>
    </div>
  );
}

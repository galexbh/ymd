// Static fixture data for the mock backend. Everything is local (no network): thumbnails are
// generated SVG data URIs so they work offline and under the app's CSP (`img-src data:`).
import type {
  BrowserInfo,
  DepId,
  DepLevel,
  FormatInfo,
  HistoryItem,
  MediaKind,
  PlaylistEntry,
  Preset,
  ProbeResult,
  Settings,
} from "../types";

// ───────────── Deterministic helpers ─────────────

/** FNV-1a 32-bit hash; stable across runs so fixtures derived from URLs are deterministic. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 16:9 SVG thumbnail as a data URI. The hue is derived from `seed`; `kind` picks a play
 * triangle or a music note. Fixture data only — not part of the UI's design tokens.
 */
export function thumbnail(seed: string, kind: MediaKind = "video", label?: string): string {
  const h = hash(seed);
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >>> 9) % 60)) % 360;
  const glyph =
    kind === "audio"
      ? '<path d="M178 58v52a14 14 0 1 1-8-12.6V70l-32 8v40a14 14 0 1 1-8-12.6V66z" fill="white" fill-opacity=".85"/>'
      : '<circle cx="160" cy="90" r="30" fill="black" fill-opacity=".35"/><path d="M151 74l26 16-26 16z" fill="white" fill-opacity=".9"/>';
  const text = label
    ? `<text x="14" y="168" font-family="system-ui,sans-serif" font-size="13" fill="white" fill-opacity=".9">${escapeXml(label.slice(0, 40))}</text>`
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 55% 42%)"/><stop offset="1" stop-color="hsl(${hue2} 60% 22%)"/>` +
    `</linearGradient></defs><rect width="320" height="180" fill="url(#g)"/>${glyph}${text}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ───────────── Paths ─────────────

export type MockPlatform = "windows" | "macos" | "linux";

export interface PlatformPaths {
  home: string;
  sep: string;
  binDir: string;
  videoDir: string;
  audioDir: string;
  downloads: string;
  exe: string;
}

export function platformPaths(platform: MockPlatform): PlatformPaths {
  switch (platform) {
    case "windows":
      return {
        home: "C:\\Users\\ana",
        sep: "\\",
        binDir: "C:\\Users\\ana\\AppData\\Local\\ymd\\bin",
        videoDir: "C:\\Users\\ana\\Videos",
        audioDir: "C:\\Users\\ana\\Music",
        downloads: "C:\\Users\\ana\\Downloads",
        exe: ".exe",
      };
    case "macos":
      return {
        home: "/Users/ana",
        sep: "/",
        binDir: "/Users/ana/Library/Application Support/com.ymd.app/bin",
        videoDir: "/Users/ana/Movies",
        audioDir: "/Users/ana/Music",
        downloads: "/Users/ana/Downloads",
        exe: "",
      };
    case "linux":
      return {
        home: "/home/ana",
        sep: "/",
        binDir: "/home/ana/.local/share/ymd/bin",
        videoDir: "/home/ana/Videos",
        audioDir: "/home/ana/Music",
        downloads: "/home/ana/Downloads",
        exe: "",
      };
  }
}

export function joinPath(sep: string, ...parts: string[]): string {
  return parts.join(sep);
}

/** Replace characters that are illegal in file names on any OS. */
export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

// ───────────── Presets & settings ─────────────

const DEFAULT_POSTPROCESS = {
  embedThumbnail: true,
  embedMetadata: true,
  embedSubs: false,
  subLangs: "es,en",
  sponsorblockRemove: [] as string[],
};

function preset(p: Pick<Preset, "id" | "name" | "kind"> & Partial<Preset>): Preset {
  return {
    video: { maxHeight: null, container: "any" },
    audio: { format: "best", quality: "0" },
    postprocess: { ...DEFAULT_POSTPROCESS, sponsorblockRemove: [] },
    outputDir: null,
    builtin: true,
    ...p,
  };
}

/** Mirrors `settings::builtin_presets()`: best, mp4-1080, mp4-720, mp3-320, audio-original. */
export function builtinPresets(): Preset[] {
  return [
    preset({ id: "best", name: "Best quality", kind: "video" }),
    preset({
      id: "mp4-1080",
      name: "MP4 1080p",
      kind: "video",
      video: { maxHeight: 1080, container: "mp4" },
    }),
    preset({
      id: "mp4-720",
      name: "MP4 720p",
      kind: "video",
      video: { maxHeight: 720, container: "mp4" },
    }),
    preset({
      id: "mp3-320",
      name: "MP3 320 kbps",
      kind: "audio",
      audio: { format: "mp3", quality: "320K" },
    }),
    preset({
      id: "audio-original",
      name: "Original audio",
      kind: "audio",
      audio: { format: "best", quality: "0" },
    }),
  ];
}

export const DEFAULT_FILENAME_TEMPLATE = "%(title)s [%(id)s].%(ext)s";

export function defaultSettings(platform: MockPlatform): Settings {
  const p = platformPaths(platform);
  return {
    language: "system",
    theme: { mode: "system", accent: null, density: "comfortable", radius: "soft", fontScale: 1 },
    videoDir: p.videoDir,
    audioDir: p.audioDir,
    askEachTime: false,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
    concurrency: 3,
    binDir: null,
    ytdlpChannel: "nightly",
    autoUpdate: true,
    useDownloadArchive: false,
    useAria2c: false,
    cookies: { kind: "none" },
    presets: builtinPresets(),
    defaultPresetId: "best",
    onboarded: true,
    clipboardWatch: "known",
  };
}

// ───────────── Dependencies ─────────────

export interface DepCatalogEntry {
  id: DepId;
  level: DepLevel;
  /** File name stem inside binDir. */
  file: string;
  latest: string;
  /** Simulated download size in bytes. */
  size: number;
  /** Raw executables skip the "extracting" phase. */
  archive: boolean;
  /** Source publishes a checksum. */
  verified: boolean;
}

export const DEP_CATALOG: Record<DepId, DepCatalogEntry> = {
  ytdlp: {
    id: "ytdlp",
    level: "required",
    file: "yt-dlp",
    latest: "2026.10.07.234512",
    size: 18_400_000,
    archive: false,
    verified: true,
  },
  ffmpeg: {
    id: "ffmpeg",
    level: "required",
    file: "ffmpeg",
    latest: "n7.1-37-gfd0e3b1",
    size: 92_000_000,
    archive: true,
    verified: true,
  },
  deno: {
    id: "deno",
    level: "recommended",
    file: "deno",
    latest: "2.5.4",
    size: 41_000_000,
    archive: true,
    verified: true,
  },
  aria2c: {
    id: "aria2c",
    level: "optional",
    file: "aria2c",
    latest: "1.37.0",
    size: 5_200_000,
    archive: true,
    verified: false,
  },
  atomicparsley: {
    id: "atomicparsley",
    level: "optional",
    file: "AtomicParsley",
    latest: "20240608.083822.1ed9031",
    size: 1_100_000,
    archive: true,
    verified: false,
  },
};

export const DEP_ORDER: DepId[] = ["ytdlp", "ffmpeg", "deno", "aria2c", "atomicparsley"];

// ───────────── Browsers ─────────────

export function browsersFixture(braveRunning: boolean, firefoxInstalled = true): BrowserInfo[] {
  return [
    {
      browser: "brave",
      profiles: [
        { id: "Default", name: "Personal" },
        { id: "Profile 1", name: "Trabajo" },
      ],
      installed: true,
      running: braveRunning,
    },
    {
      browser: "firefox",
      profiles: firefoxInstalled
        ? [{ id: "Profiles/x8k2m1qa.default-release", name: "default-release" }]
        : [],
      installed: firefoxInstalled,
      running: false,
    },
  ];
}

// ───────────── Probe ─────────────

const VIDEO_TITLES: { title: string; uploader: string }[] = [
  { title: "Cómo hacer pan de masa madre en casa", uploader: "Cocina con Lucía" },
  { title: "The Art of Minimal Desk Setups", uploader: "Studio Nord" },
  { title: "Tutorial de Rust: ownership explicado fácil", uploader: "Código Claro" },
  { title: "Rainy Lo-Fi Beats to Study To", uploader: "Night Owl Radio" },
  { title: "Volcanes de Centroamérica desde el aire", uploader: "Geo Andes" },
  { title: "Building a Tiny Cabin in the Woods", uploader: "Timber & Thread" },
];

function formatsFor(maxHeight: number): FormatInfo[] {
  const out: FormatInfo[] = [
    {
      formatId: "251",
      ext: "webm",
      height: null,
      fps: null,
      vcodec: "none",
      acodec: "opus",
      abr: 132,
      filesize: 4_800_000,
      note: "medium",
    },
    {
      formatId: "140",
      ext: "m4a",
      height: null,
      fps: null,
      vcodec: "none",
      acodec: "mp4a.40.2",
      abr: 129,
      filesize: 4_700_000,
      note: "medium",
    },
  ];
  const ladder: [number, string, string, number][] = [
    [360, "134", "mp4", 9_000_000],
    [480, "135", "mp4", 14_000_000],
    [720, "136", "mp4", 28_000_000],
    [1080, "137", "mp4", 55_000_000],
    [1440, "400", "mp4", 110_000_000],
    [2160, "401", "mp4", 240_000_000],
  ];
  for (const [height, id, ext, size] of ladder) {
    if (height > maxHeight) break;
    out.push({
      formatId: id,
      ext,
      height,
      fps: height >= 1080 ? 60 : 30,
      vcodec: "avc1.640028",
      acodec: "none",
      abr: null,
      filesize: size,
      note: `${height}p`,
    });
  }
  return out;
}

export function isPlaylistUrl(url: string): boolean {
  return /[?&]list=|\/playlist|\/sets\/|\/album\//i.test(url);
}

export function extractorFor(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.includes("soundcloud.com")) return "soundcloud";
  if (u.includes("bandcamp.com")) return "Bandcamp";
  return "generic";
}

export function videoIdFor(url: string): string {
  const m = /[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})/.exec(url);
  if (m) return m[1] ?? m[2];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const r = rng(hash(url));
  let id = "";
  for (let i = 0; i < 11; i++) id += alphabet[Math.floor(r() * alphabet.length)];
  return id;
}

export function probeVideo(url: string): ProbeResult {
  const h = hash(url);
  const pick = VIDEO_TITLES[h % VIDEO_TITLES.length];
  const maxHeight = [720, 1080, 1080, 1440, 2160][h % 5];
  const id = videoIdFor(url);
  return {
    kind: "video",
    url,
    id,
    title: pick.title,
    uploader: pick.uploader,
    duration: 120 + (h % 1500),
    thumbnail: thumbnail(url, "video", pick.title),
    extractor: extractorFor(url),
    formats: formatsFor(maxHeight),
    maxHeight,
    entries: [],
  };
}

const PLAYLIST_TRACKS = [
  "Intro (Amanecer)",
  "Calles de Tegucigalpa",
  "Northern Lights",
  "Café a medianoche",
  "Paper Planes",
  "Lluvia en La Ceiba",
  "Slow Motion",
  "Río Ulúa",
  "City of Glass",
  "Brisa del Caribe",
  "Afterglow",
  "Outro (Volver)",
];

export function probePlaylist(url: string): ProbeResult {
  const h = hash(url);
  const listId = `PL${videoIdFor(url + "#list")}${videoIdFor(url + "#list2").slice(0, 5)}`;
  const entries: PlaylistEntry[] = PLAYLIST_TRACKS.map((title, i) => {
    const id = videoIdFor(`${url}#${i}`);
    return {
      index: i + 1,
      id,
      title,
      duration: 150 + ((h >>> i) % 160),
      thumbnail: thumbnail(`${url}#${i}`, "video"),
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  });
  return {
    kind: "playlist",
    url,
    id: listId,
    title: "Mix de estudio — Study Session Vol. 2",
    uploader: "Night Owl Radio",
    duration: entries.reduce((s, e) => s + (e.duration ?? 0), 0),
    thumbnail: thumbnail(url, "video", "Playlist"),
    extractor: extractorFor(url),
    formats: [],
    maxHeight: 1080,
    entries,
  };
}

// ───────────── History seed ─────────────

const HISTORY_SEED: { title: string; kind: MediaKind; extractor: string; preset: string }[] = [
  {
    title: "Cómo hacer pan de masa madre en casa",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 1080p",
  },
  {
    title: "Rainy Lo-Fi Beats to Study To",
    kind: "audio",
    extractor: "youtube",
    preset: "MP3 320 kbps",
  },
  {
    title: "Conferencia: El futuro de la banca digital",
    kind: "video",
    extractor: "youtube",
    preset: "Best quality",
  },
  {
    title: "The Art of Minimal Desk Setups",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 720p",
  },
  {
    title: "Podcast Ep. 42 — Finanzas personales sin estrés",
    kind: "audio",
    extractor: "soundcloud",
    preset: "Original audio",
  },
  {
    title: "Volcanes de Centroamérica desde el aire",
    kind: "video",
    extractor: "vimeo",
    preset: "Best quality",
  },
  {
    title: "Live at the Blue Room (Full Set)",
    kind: "audio",
    extractor: "Bandcamp",
    preset: "MP3 320 kbps",
  },
  {
    title: "Tutorial de Rust: ownership explicado fácil",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 1080p",
  },
  { title: "Morning Jazz Café", kind: "audio", extractor: "youtube", preset: "MP3 320 kbps" },
  {
    title: "Building a Tiny Cabin in the Woods",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 1080p",
  },
  {
    title: "Clase de guitarra: acordes básicos",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 720p",
  },
  {
    title: "Ambient Rain Sounds — 1 Hour",
    kind: "audio",
    extractor: "youtube",
    preset: "Original audio",
  },
  {
    title: "Receta: baleadas hondureñas auténticas",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 1080p",
  },
  {
    title: "TypeScript 6 in 100 Seconds",
    kind: "video",
    extractor: "youtube",
    preset: "Best quality",
  },
  {
    title: "Entrevista con un arquitecto de software",
    kind: "audio",
    extractor: "soundcloud",
    preset: "MP3 320 kbps",
  },
  {
    title: "Drone Footage: Roatán Reef 4K",
    kind: "video",
    extractor: "vimeo",
    preset: "Best quality",
  },
  {
    title: "Canciones de cuna para dormir",
    kind: "audio",
    extractor: "youtube",
    preset: "MP3 320 kbps",
  },
  { title: "How Batteries Actually Work", kind: "video", extractor: "youtube", preset: "MP4 720p" },
  {
    title: "Documental: la ruta del café",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 1080p",
  },
  {
    title: "Synthwave Night Drive Mix",
    kind: "audio",
    extractor: "youtube",
    preset: "Original audio",
  },
  {
    title: "Charla TEDx: Aprender a desaprender",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 720p",
  },
  {
    title: "Field Recording — Cloud Forest at Dawn",
    kind: "audio",
    extractor: "Bandcamp",
    preset: "Original audio",
  },
  {
    title: "Yoga para principiantes (20 min)",
    kind: "video",
    extractor: "youtube",
    preset: "MP4 1080p",
  },
  {
    title: "Keynote Highlights in 12 Minutes",
    kind: "video",
    extractor: "youtube",
    preset: "Best quality",
  },
  {
    title: "Marimba tradicional — en vivo",
    kind: "audio",
    extractor: "youtube",
    preset: "MP3 320 kbps",
  },
];

/** Preset ids of the builtin names used in the seed. */
const PRESET_IDS: Record<string, string> = {
  "Best quality": "best",
  "MP4 1080p": "mp4-1080",
  "MP4 720p": "mp4-720",
  "MP3 320 kbps": "mp3-320",
  "Original audio": "audio-original",
};

/** Rows from before history schema v2 carry no accession number or preset id. */
export const LEGACY_HISTORY_ROWS = 3;

/**
 * ~25 realistic history rows, newest first, some with `exists: false` (file moved/deleted).
 * Accession numbers run 1..N oldest to newest; the oldest few are legacy rows without one.
 */
export function seedHistory(now: number, platform: MockPlatform): HistoryItem[] {
  const p = platformPaths(platform);
  const r = rng(42);
  let t = now - 2 * 3600_000;
  return HISTORY_SEED.map((s, i) => {
    t -= Math.floor((0.3 + r() * 1.4) * 86_400_000);
    const url =
      s.extractor === "youtube"
        ? `https://www.youtube.com/watch?v=${videoIdFor(s.title)}`
        : s.extractor === "vimeo"
          ? `https://vimeo.com/${100000000 + (hash(s.title) % 899999999)}`
          : s.extractor === "soundcloud"
            ? `https://soundcloud.com/demo/${safeFileName(s.title).toLowerCase().replace(/\s+/g, "-")}`
            : `https://artist.bandcamp.com/track/${hash(s.title).toString(36)}`;
    const ext = s.kind === "audio" ? (s.preset.startsWith("MP3") ? "mp3" : "opus") : "mp4";
    const dir = s.kind === "audio" ? p.audioDir : p.videoDir;
    const size =
      s.kind === "audio"
        ? Math.floor(3_000_000 + r() * 120_000_000)
        : Math.floor(25_000_000 + r() * 900_000_000);
    const n = HISTORY_SEED.length - i;
    const legacy = n <= LEGACY_HISTORY_ROWS;
    return {
      id: n,
      seq: legacy ? null : n,
      presetId: legacy ? null : (PRESET_IDS[s.preset] ?? null),
      url,
      title: s.title,
      filepath: joinPath(p.sep, dir, `${safeFileName(s.title)} [${videoIdFor(s.title)}].${ext}`),
      kind: s.kind,
      presetName: s.preset,
      size,
      thumbnail: thumbnail(s.title, s.kind),
      extractor: s.extractor,
      completedAt: new Date(t).toISOString(),
      exists: ![3, 9, 16, 21].includes(i),
    };
  });
}

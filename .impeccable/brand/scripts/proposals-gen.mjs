// Generates brand proposal SVGs + comparison page. Usage: node gen.mjs <outDir>
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const INK = "#5B3FC4";          // violet date-stamp ink (light grounds)
const INK_DK = "#A898F5";       // same ink, lifted for dark grounds
const SLATE = "#1E262B", BOARD = "#E9ECEA", PAPER = "#F2F3EF", RULE = "#8C9CA8", TILE = "#28343C";

const svg = (vb, body, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${body}</svg>\n`;
const R = (x, y, w, h, a = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${a}/>`;

/* ---------- isotypes (64 grid, 2-unit = 1px @32, 4-unit = 1px @16) ---------- */
const iso = {
  // A: accession stamp. Double-ruled frame; the y's tail breaks through both rules.
  a: `<g fill="currentColor">${[
      R(4,4,56,4), R(4,8,4,52), R(56,8,4,52), R(4,56,30,4), R(50,56,10,4),
      R(10,10,44,2), R(10,12,2,42), R(52,12,2,42), R(10,52,24,2), R(50,52,4,2)].join("")}</g>` +
     `<path d="M22 16V30A10 10 0 0 0 42 30M42 16V64" fill="none" stroke="currentColor" stroke-width="8"/>`,
  // B: archive-box end. Lid notch + slot = intake "y"; knocked-out label holder with an inked entry.
  b: `<g fill="currentColor"><path d="M6 10H24L28 14V20H6ZM36 14L40 10H58V20H36Z"/>` +
     `<path fill-rule="evenodd" d="M8 22H28V36H36V22H56V58H8ZM16 40V52H48V40Z"/></g>` +
     R(20,45,18,2,' class="ink" fill="' + INK + '"'),
  // C: catalog card on the rod. Exact inked span on the heading rule; punched rod hole.
  c: `<path fill="currentColor" fill-rule="evenodd" d="M4 10H60V54H4ZM8 14V50H56V14Z"/>` +
     R(12,20,28,4,' class="ink" fill="' + INK + '"') +
     `<g fill="currentColor">${R(40,22,12,2)}${R(12,30,40,2)}<circle cx="32" cy="42" r="4"/></g>`,
};

/* ---------- 16px hand-hinted versions (integer pixels) ---------- */
const iso16 = {
  a: `<g fill="currentColor">${[
      R(1,1,14,1), R(1,2,1,13), R(14,2,1,13), R(1,14,8,1), R(13,14,2,1),
      R(4,4,2,6), R(5,9,6,2), R(10,4,2,12)].join("")}</g>`,
  b: `<g fill="currentColor"><path d="M2 2H6L7 3V4H2ZM9 3L10 2H14V4H9Z"/>` +
     `<path fill-rule="evenodd" d="M2 5H7V9H9V5H14V15H2ZM4 11V13H12V11Z"/></g>`,
  c: `<g fill="currentColor">${[R(1,2,14,1), R(1,13,14,1), R(1,3,1,10), R(14,3,1,10),
      R(9,5,4,1), R(3,8,10,1), R(7,10,2,2)].join("")}</g>` + R(3,4,6,2,' class="ink" fill="' + INK + '"'),
};

/* ---------- wordmarks: monoline, stroke 6, x-height 20..44, asc 8, desc 58 ---------- */
const S = `fill="none" stroke="currentColor" stroke-width="6"`;
// shared round skeleton: m arches r7 overshoot 1 above x-height; bowls overshoot 1 below baseline
const mRound = `M3 20V44M3 29A7 7 0 0 1 17 29V44M17 29A7 7 0 0 1 31 29V44`;
const dRound = (x) => `<circle cx="${x + 13}" cy="32" r="10"/><path d="M${x + 23} 8V44"/>`;
const word = {
  // A: rubber-stamp type. Butt-cut terminals; the y's tail drops straight like the isotype.
  a: `<g ${S}><path d="M3 20V30A7 7 0 0 0 17 30M17 20V58"/>` +
     `<path transform="translate(26 0)" d="${mRound}"/>${dRound(65)}</g>`,
  // B: box-corner type. Squared shoulders (r4 corners, the box's folded edges); y is the intake notch.
  b: `<g ${S} stroke-linejoin="miter"><path d="M1.5 20L11 40M20.5 20L7.5 58"/>` +
     `<path transform="translate(26 0)" d="M3 20V44M3 44V27Q3 23 7 23H13Q17 23 17 27V44M17 27Q17 23 21 23H27Q31 23 31 27V44"/>` +
     `<path d="M88 23H71Q67 23 67 27V37Q67 41 71 41H88M88 8V44"/></g>`,
  // C: card-index type. Geometric round; the d's counter is the rod hole; a ruled line carries an exact inked span.
  c: `<g ${S}><path d="M3 20V30A7 7 0 0 0 17 30M17 20V48A7 7 0 0 1 10 55H4"/>` +
     `<path transform="translate(26 0)" d="${mRound}"/>${dRound(64)}</g>`,
};
const wordExtra = {
  a: "",
  b: "",
  c: R(0,62,92,2,' fill="currentColor" opacity=".35"') + R(0,61,58,3,' class="ink" fill="' + INK + '"'),
};

const logotype = (k) => svg("0 0 176 66",
  iso[k] + `<g transform="translate(84 0)">${word[k]}${wordExtra[k]}</g>`);

/* ---------- 1024 app icons (macOS safe area 824, r≈185) ---------- */
const tile = (fill, edge) =>
  `<defs><filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".28"/></filter></defs>` +
  `<rect x="100" y="100" width="824" height="824" rx="185" fill="${fill}" filter="url(#sh)"/>` +
  `<rect x="103" y="103" width="818" height="818" rx="182" fill="none" stroke="${edge}" stroke-width="6"/>`;
const place = (inner, color, s = 8, dy = 0) =>
  `<g transform="translate(${512 - 32 * s} ${512 - 32 * s + dy}) scale(${s})" color="${color}">${inner}</g>`;
const app = {
  a: tile(PAPER, "#C3CAC6") + place(iso.a.replaceAll(INK, INK), INK, 8),
  b: tile(TILE, "#3E4E59") +
     place(iso.b.replace(/<rect x="20"[^>]*\/>/, "") + R(16,40,32,12,` fill="${INK_DK}"`) + R(20,45,18,2,` fill="${TILE}"`), BOARD, 8, 8),
  c: tile(TILE, "#3E4E59") + place(
     `<rect x="4" y="10" width="56" height="44" rx="1.5" fill="${PAPER}"/>` +
     R(12,20,28,4,` fill="${INK}"`) + R(40,22,12,2,` fill="${RULE}"`) + R(12,30,40,2,` fill="${RULE}"`) +
     R(12,36,40,1,` fill="${RULE}" opacity=".6"`) + `<circle cx="32" cy="44" r="4" fill="${TILE}"/>`, SLATE, 8),
};

for (const k of ["a", "b", "c"]) {
  fs.writeFileSync(path.join(OUT, `${k}-isotype.svg`), svg("0 0 64 64", iso[k], ' width="64" height="64"'));
  fs.writeFileSync(path.join(OUT, `${k}-isotype-16.svg`), svg("0 0 16 16", iso16[k], ' width="16" height="16" shape-rendering="crispEdges"'));
  fs.writeFileSync(path.join(OUT, `${k}-logotype.svg`), logotype(k));
  fs.writeFileSync(path.join(OUT, `${k}-appicon.svg`), svg("0 0 1024 1024", app[k], ' width="1024" height="1024"'));
}

/* ---------- comparison page (everything inline, no external resources) ---------- */
const meta = {
  a: ["A · Sello de entrada",
      "Un sello de registro de doble filete, como el fechador que se estampa en cada ingreso al archivo. Dentro, una «y» de trazo grueso cuya cola atraviesa ambos filetes y sale del marco: el material entra al archivo propio. Encaja con la firma del producto (el sello ARCHIVADO que golpea la fila al completar) y es la marca más directa del mundo «registro de archivo»; además, como es una sola tinta, funciona en violeta sello sin depender de un segundo color. Riesgo honesto: un marco cuadrado con una letra dentro es una forma de favicon muy común; lo que la distingue es la cola que rompe el marco y el doble filete, y este último desaparece por debajo de 32 px (la versión de 16 px lo reduce a un filete)."],
  b: ["B · Caja de archivo",
      "El extremo de una caja Hollinger: tapa más ancha que el cuerpo, porta-etiqueta y una muesca de entrada en la tapa que baja como ranura. Muesca más ranura dibujan una «y» en negativo y, a la vez, el gesto de ingresar algo a la caja. La etiqueta lleva un trazo en tinta violeta, el asiento. Habla del destino (tu archivo, tu caja) en vez de la acción de descargar, y es la silueta más reconocible a 16 px. Riesgo honesto: la «y» se lee más como «Y» mayúscula o embudo que como letra minúscula, y una caja con ranura puede confundirse con un buzón o una urna; la muesca debe mantenerse angulosa para no parecer una bandeja de descargas."],
  c: ["C · Ficha de catálogo",
      "La ficha de catálogo de biblioteca, apaisada, con su perforación para la varilla del fichero. En la línea de encabezado, un tramo de tinta violeta exacto que se detiene y deja ver el resto del renglón: el mismo «tramo entintado» que la app usa como progreso real. En el logotipo, el contraojo de la «d» es la perforación y la palabra se apoya sobre un renglón con su tramo entintado. Es la más ligada al mecanismo (registrar, catalogar, recuperar). Riesgo honesto: a tamaños chicos puede leerse como un icono genérico de documento o de tarjeta; la perforación es el rasgo distintivo y a 16 px queda en un punto de 2×2."],
};
const read = (f) => fs.readFileSync(path.join(OUT, f), "utf8").replace(/ width="\d+" height="\d+"/, "");
const sizes = [16, 24, 32, 48, 128];
const isoAt = (k, s) => `<span class="sz" style="width:${s}px;height:${s}px">${s <= 16 ? read(`${k}-isotype-16.svg`) : read(`${k}-isotype.svg`)}</span>`;
const ground = (k, cls) => `<div class="g ${cls}"><div class="row">${sizes.map((s) => `<figure>${isoAt(k, s)}<figcaption>${s}</figcaption></figure>`).join("")}</div>` +
  `<div class="logo">${read(`${k}-logotype.svg`)}</div><div class="logo sm">${read(`${k}-logotype.svg`)}</div></div>`;
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ymd · propuestas de marca</title><style>
:root{--board:${BOARD};--slate:${SLATE};--ink:#1E262B;--rule:${RULE}}
*{box-sizing:border-box}body{margin:0;background:#D9DEDB;color:var(--ink);font:14px/1.5 system-ui,"Segoe UI",sans-serif}
main{max-width:1500px;margin:0 auto;padding:32px 24px}
h1{font-size:22px;margin:0 0 4px}p.lead{margin:0 0 24px;color:#45525a;max-width:72ch}
section{display:grid;grid-template-columns:1fr 1fr 280px;gap:16px;padding:24px 0;border-top:1px solid var(--rule)}
section h2{grid-column:1/-1;margin:0;font-size:17px}
section p{grid-column:1/-1;margin:0;max-width:110ch;color:#2c373e}
.g{border-radius:6px;padding:20px;display:flex;flex-direction:column;gap:20px}
.lt{background:var(--board);color:var(--slate)}.dk{background:var(--slate);color:#E2E6E4}.dk .ink{fill:${INK_DK}}
.row{display:flex;align-items:flex-end;gap:22px}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}
figcaption{font:11px ui-monospace,Consolas,monospace;opacity:.6;font-variant-numeric:tabular-nums}
.sz svg{width:100%;height:100%;display:block}
.logo svg{height:72px;width:auto;display:block}.logo.sm svg{height:28px}
.icons{display:grid;gap:10px}.icons .t{border-radius:6px;padding:10px;display:flex;justify-content:center;gap:10px;align-items:center}
.icons svg{display:block}
</style></head><body><main>
<h1>ymd · isotipo y logotipo, tres propuestas</h1>
<p class="lead">Mundo: registro de archivo. Cada propuesta se muestra a 16, 24, 32, 48 y 128 px sobre cartón de archivo claro y pizarra oscura, con el logotipo en dos tamaños y el icono de aplicación sobre escritorio claro y oscuro. A 16 px se usa la versión ajustada a píxel.</p>
${["a", "b", "c"].map((k) => `<section><h2>${meta[k][0]}</h2>${ground(k, "lt")}${ground(k, "dk")}
<div class="icons"><div class="t" style="background:#F3F3F3">${read(`${k}-appicon.svg`).replace("<svg", '<svg width="128" height="128"')}${read(`${k}-appicon.svg`).replace("<svg", '<svg width="40" height="40"')}</div>
<div class="t" style="background:#202020">${read(`${k}-appicon.svg`).replace("<svg", '<svg width="128" height="128"')}${read(`${k}-appicon.svg`).replace("<svg", '<svg width="40" height="40"')}</div></div>
<p>${meta[k][1]}</p></section>`).join("\n")}
</main></body></html>\n`;
// filter ids repeat across inline icons; make them unique per instance
let n = 0;
fs.writeFileSync(path.join(OUT, "index.html"), html.replace(/id="sh"([\s\S]*?)url\(#sh\)/g, (_, mid) => { n++; return `id="sh${n}"${mid}url(#sh${n})`; }));
console.log("ok");

// Live example of a yt-dlp output template, rendered with sample metadata.
// Handles the common `%(field)s` / `%(field).NNB` / `%(field)03d` forms; unknown fields render
// as "NA", like yt-dlp does.

export const SAMPLE_FIELDS: Record<string, string | number> = {
  title: "Volcanes de Centroamérica desde el aire",
  id: "dQw4w9WgXcQ",
  ext: "mp4",
  uploader: "Geo Andes",
  channel: "Geo Andes",
  upload_date: "20260914",
  playlist: "Viajes",
  playlist_title: "Viajes",
  playlist_index: 3,
  duration_string: "12:41",
  height: 1080,
  resolution: "1920x1080",
  extractor: "youtube",
};

const FIELD = /%\(([\w.]+)\)([-#0+ ]*\d*(?:\.\d+)?[A-Za-z]?)([sdfB])/g;

export function renderTemplate(
  template: string,
  fields: Record<string, string | number> = SAMPLE_FIELDS,
): string {
  return template.replace(FIELD, (_m, name: string, spec: string, conv: string) => {
    const v = fields[name];
    if (v === undefined) return "NA";
    if (conv === "d") {
      const pad = /^0(\d+)/.exec(spec);
      return pad ? String(v).padStart(Number(pad[1]), "0") : String(v);
    }
    const prec = /\.(\d+)/.exec(spec);
    const s = String(v);
    if (prec) {
      const n = Number(prec[1]);
      // B = bytes; close enough for an example
      return s.slice(0, n);
    }
    return s;
  });
}

/** Whether the template names the file extension (yt-dlp needs it). */
export function templateHasExt(template: string): boolean {
  return /%\(ext\)/.test(template);
}

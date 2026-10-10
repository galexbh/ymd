// Curated video/audio sites yt-dlp supports, shared by the app (copied-link detection) and the
// ymd Cookies extension («Usar mi sesión de…» in its popup). No imports: both builds use it.

export interface Provider {
  name: string;
  /** registrable domains, the main one first; subdomains match too (`m.youtube.com`) */
  domains: readonly string[];
}

export const PROVIDERS: readonly Provider[] = [
  {
    name: "YouTube",
    domains: [
      "youtube.com",
      "youtu.be",
      "music.youtube.com",
      "m.youtube.com",
      "youtube-nocookie.com",
    ],
  },
  { name: "Vimeo", domains: ["vimeo.com"] },
  { name: "SoundCloud", domains: ["soundcloud.com"] },
  { name: "Bandcamp", domains: ["bandcamp.com"] },
  { name: "TikTok", domains: ["tiktok.com"] },
  { name: "X/Twitter", domains: ["x.com", "twitter.com"] },
  { name: "Instagram", domains: ["instagram.com"] },
  { name: "Facebook", domains: ["facebook.com", "fb.watch"] },
  { name: "Twitch", domains: ["twitch.tv"] },
  { name: "Dailymotion", domains: ["dailymotion.com", "dai.ly"] },
  { name: "Reddit", domains: ["reddit.com", "v.redd.it"] },
  { name: "Bilibili", domains: ["bilibili.com"] },
  { name: "Kick", domains: ["kick.com"] },
  { name: "Rumble", domains: ["rumble.com"] },
  { name: "Streamable", domains: ["streamable.com"] },
  { name: "Mixcloud", domains: ["mixcloud.com"] },
  { name: "Odysee", domains: ["odysee.com"] },
];

/** The provider a host belongs to (exact host or a true subdomain), if any. */
export function providerOf(host: string): Provider | undefined {
  const h = host.toLowerCase();
  return PROVIDERS.find((p) => p.domains.some((d) => h === d || h.endsWith("." + d)));
}

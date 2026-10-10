import { describe, expect, it } from "vitest";
import { classify, MAX_LINK_LENGTH, PROVIDERS } from "../clipboardLink";

const known = (text: string) => classify(text, "known");

describe("classify: YouTube", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=AbCdEf123&t=42",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s",
    "https://www.youtube.com/shorts/abcdefghijk",
    "https://youtu.be/dQw4w9WgXcQ?si=xyz&t=10",
    "https://music.youtube.com/watch?v=abc123&list=RDAMVM",
    "https://www.youtube.com/playlist?list=PL1234567890",
    "https://www.youtube.com/live/abcdefghijk?si=zz",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "http://youtube.com/watch?v=x",
    "HTTPS://WWW.YOUTUBE.COM/watch?v=CaSe",
  ])("%s", (url) => {
    expect(known(url)).toEqual({ url, provider: "YouTube", known: true });
  });

  it("trims surrounding whitespace and returns the URL exactly as copied", () => {
    expect(known("  \n https://youtu.be/abc?si=Q&t=3 \t\n")).toEqual({
      url: "https://youtu.be/abc?si=Q&t=3",
      provider: "YouTube",
      known: true,
    });
  });
});

describe("classify: every provider", () => {
  const cases: [string, string][] = [
    ["https://vimeo.com/123456789", "Vimeo"],
    ["https://player.vimeo.com/video/123", "Vimeo"],
    ["https://soundcloud.com/artist/track", "SoundCloud"],
    ["https://on.soundcloud.com/abc", "SoundCloud"],
    ["https://artist.bandcamp.com/album/name", "Bandcamp"],
    ["https://bandcamp.com/discover", "Bandcamp"],
    ["https://www.tiktok.com/@user/video/7300000000000000000", "TikTok"],
    ["https://vm.tiktok.com/ZMabc/", "TikTok"],
    ["https://x.com/user/status/1700000000000000000", "X/Twitter"],
    ["https://twitter.com/user/status/1", "X/Twitter"],
    ["https://www.instagram.com/reel/Cabc123/", "Instagram"],
    ["https://www.facebook.com/watch/?v=123", "Facebook"],
    ["https://www.facebook.com/reel/123", "Facebook"],
    ["https://fb.watch/abcDEF/", "Facebook"],
    ["https://www.twitch.tv/videos/123456", "Twitch"],
    ["https://clips.twitch.tv/SomeClip", "Twitch"],
    ["https://www.dailymotion.com/video/x8abc", "Dailymotion"],
    ["https://dai.ly/x8abc", "Dailymotion"],
    ["https://v.redd.it/abc123", "Reddit"],
    ["https://www.reddit.com/r/videos/comments/abc/title/", "Reddit"],
    ["https://www.bilibili.com/video/BV1xx411c7mD", "Bilibili"],
    ["https://kick.com/channel/videos/abc", "Kick"],
    ["https://rumble.com/v4abc-title.html", "Rumble"],
    ["https://streamable.com/abc12", "Streamable"],
    ["https://www.mixcloud.com/user/mix-name/", "Mixcloud"],
    ["https://odysee.com/@chan:1/video:2", "Odysee"],
  ];

  it.each(cases)("%s → %s", (url, provider) => {
    expect(known(url)).toEqual({ url, provider, known: true });
  });

  it("covers every provider in the table", () => {
    const tested = new Set(cases.map(([, p]) => p));
    tested.add("YouTube");
    expect([...tested].sort()).toEqual(PROVIDERS.map((p) => p.name).sort());
  });

  it("matches a host with a trailing dot", () => {
    expect(known("https://youtube.com./watch?v=a")?.provider).toBe("YouTube");
  });
});

describe("classify: rejects", () => {
  it.each([
    ["lookalike suffix", "https://youtube.com.evil.com/watch?v=a"],
    ["lookalike prefix", "https://notyoutube.com/watch?v=a"],
    ["lookalike hyphen", "https://my-youtube.com/watch?v=a"],
    ["lookalike other tld", "https://youtube.co/watch?v=a"],
    ["host in the path", "https://evil.com/youtube.com/watch?v=a"],
    ["host in the query", "https://evil.com/?u=https://youtube.com"],
    ["fake bandcamp", "https://bandcamp.com.evil.net/album"],
    ["punycode lookalike", "https://yоutube.com/watch?v=a"],
  ])("%s", (_, url) => {
    expect(known(url)).toBeNull();
    expect(classify(url, "any")?.known ?? false).toBe(false);
  });

  it.each([
    ["two lines", "https://youtu.be/a\nhttps://youtu.be/b"],
    ["link and a line of text", "https://youtu.be/a\nmira esto"],
    ["CRLF lines", "https://youtu.be/a\r\nhttps://youtu.be/b"],
    ["text with spaces", "mira https://youtu.be/abc"],
    ["URL with a space inside", "https://youtu.be/a b"],
    ["tab inside", "https://youtu.be/a\tb"],
    ["email", "ana@example.com"],
    ["mailto", "mailto:ana@youtube.com"],
    ["plain words", "hola mundo"],
    ["a password-ish token", "S3cr3t!Pa55w0rd"],
    ["javascript:", "javascript:alert(1)//https://youtube.com"],
    ["file:", "file:///C:/Users/ana/youtube.com/video.mp4"],
    ["data:", "data:text/html,https://youtube.com"],
    ["ftp:", "ftp://youtube.com/video"],
    ["no scheme", "youtube.com/watch?v=a"],
    ["protocol-relative", "//youtube.com/watch?v=a"],
    ["credentials", "https://user:pass@youtube.com/watch?v=a"],
    ["user only", "https://user@www.youtube.com/watch?v=a"],
    ["credentials hiding the real host", "https://youtube.com@evil.com/watch"],
    ["IPv4 host", "https://142.250.0.1/watch?v=a"],
    ["IPv4 short form", "http://2130706433/watch"],
    ["IPv6 host", "https://[2001:db8::1]/watch?v=a"],
    ["localhost", "http://localhost:1420/"],
    ["empty", ""],
    ["only spaces", "   \n\t "],
    ["just the scheme", "https://"],
  ])("%s", (_, text) => {
    expect(classify(text, "known")).toBeNull();
    expect(classify(text, "any")).toBeNull();
  });

  it("rejects very long input without parsing it", () => {
    const long = "https://www.youtube.com/watch?v=a&x=" + "a".repeat(MAX_LINK_LENGTH);
    expect(known(long)).toBeNull();
    expect(classify(long, "any")).toBeNull();
    expect(known("x".repeat(1_000_000))).toBeNull();
  });

  it("accepts a long but reasonable link", () => {
    const url = "https://www.youtube.com/watch?v=a&x=" + "a".repeat(1500);
    expect(known(url)?.provider).toBe("YouTube");
  });
});

describe("classify: modes", () => {
  const yt = "https://youtu.be/dQw4w9WgXcQ";
  const other = "https://www.example.org/media/clip";

  it("off: never matches", () => {
    expect(classify(yt, "off")).toBeNull();
    expect(classify(other, "off")).toBeNull();
  });

  it("known: providers only", () => {
    expect(classify(yt, "known")).toEqual({ url: yt, provider: "YouTube", known: true });
    expect(classify(other, "known")).toBeNull();
  });

  it("any: providers stay known, other http(s) links come back unknown with their host", () => {
    expect(classify(yt, "any")).toEqual({ url: yt, provider: "YouTube", known: true });
    expect(classify(other, "any")).toEqual({ url: other, provider: "example.org", known: false });
    expect(classify("http://news.example.com/a", "any")?.provider).toBe("news.example.com");
  });

  it("any: still rejects non-links, other schemes, credentials and IPs", () => {
    for (const text of [
      "javascript:void(0)",
      "file:///etc/passwd",
      "https://a:b@example.org/",
      "http://10.0.0.1/",
      "two\nlines",
    ]) {
      expect(classify(text, "any")).toBeNull();
    }
  });
});

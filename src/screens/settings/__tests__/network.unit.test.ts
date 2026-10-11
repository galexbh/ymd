import { describe, expect, it } from "vitest";
import { checkProxy, inRange, normalizeProxy } from "../network";

// Same cases as `settings::tests::proxy_rules` in Rust.
describe("checkProxy", () => {
  it.each([
    ["http://127.0.0.1:8080", "http://127.0.0.1:8080"],
    ["  socks5://127.0.0.1:1080  ", "socks5://127.0.0.1:1080"],
    ["socks5h://Proxy.Example.com:1080/", "socks5h://proxy.example.com:1080"],
    ["HTTPS://proxy.example.com", "https://proxy.example.com"],
    ["socks4://10.0.0.1:1080", "socks4://10.0.0.1:1080"],
    ["socks4a://gw:1080", "socks4a://gw:1080"],
    ["socks5://[::1]:1080", "socks5://[::1]:1080"],
    ["http://[2001:DB8::1]", "http://[2001:db8::1]"],
    ["http://proxy:65535", "http://proxy:65535"],
    ["http://proxy:80", "http://proxy"],
    ["https://proxy:443/", "https://proxy"],
    ["socks5://proxy:80", "socks5://proxy:80"],
    ["http://proxy:", "http://proxy"],
  ])("accepts %j as %j", (raw, want) => {
    expect(checkProxy(raw)).toEqual({ kind: "ok", value: want });
    expect(normalizeProxy(raw)).toBe(want);
  });

  it.each(["http://u:p@host:8080", "http://user@host:8080", "socks5://:secret@host:1080"])(
    "flags credentials in %j",
    (raw) => {
      expect(checkProxy(raw)).toEqual({ kind: "credentials" });
      expect(normalizeProxy(raw)).toBeNull();
    },
  );

  it.each([
    "-x",
    "--proxy",
    "127.0.0.1:8080",
    "proxy.example.com",
    "http://host:8080/path?q",
    "http://host:8080/path",
    "http://host:8080?q=1",
    "http://host:8080#frag",
    "ftp://h",
    "file:///etc/passwd",
    "socks://h:1080",
    "http://host:8080\n--exec=calc",
    "http://ho\r\nst:8080",
    "http://host:8080\r\nX-Injected: 1",
    "http://ho st:8080",
    "http://ho\tst:8080",
    "http://host\u0000:1",
    "http://host:0",
    "http://host:70000",
    "http://host:123456",
    "http://host:8a",
    "http://",
    "socks5://",
    "http://ho_st:1",
    "http://-host:1",
    "http://ñandú.com",
    "http://ho%73t:1",
    "http:\\\\host",
    "http://[1.2.3.4]",
    "http://[::1",
    "http://a:b:c",
  ])("rejects %j", (raw) => {
    expect(checkProxy(raw)).toEqual({ kind: "invalid" });
    expect(normalizeProxy(raw)).toBeNull();
  });

  it("an empty field means no proxy", () => {
    expect(checkProxy("")).toEqual({ kind: "empty" });
    expect(checkProxy("   ")).toEqual({ kind: "empty" });
    expect(normalizeProxy("")).toBeNull();
    expect(normalizeProxy(null)).toBeNull();
    expect(normalizeProxy(42)).toBeNull();
  });
});

describe("inRange", () => {
  it("keeps whole numbers within bounds only", () => {
    expect(inRange(1, 1, 300)).toBe(1);
    expect(inRange(300, 1, 300)).toBe(300);
    expect(inRange(0, 1, 300)).toBeNull();
    expect(inRange(301, 1, 300)).toBeNull();
    expect(inRange(2.5, 1, 300)).toBeNull();
    expect(inRange("10", 1, 300)).toBeNull();
    expect(inRange(null, 0, 50)).toBeNull();
    expect(inRange(0, 0, 50)).toBe(0);
  });
});

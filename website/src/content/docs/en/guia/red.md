---
title: Network
description: Proxy, IP version, timeout, retries and the download speed limit.
---

**Settings → Network** gathers the connection options ymd passes to yt-dlp. They apply to downloads, to link analysis in **Receive** and to **Test cookies** in **Settings → Accounts**. Changes apply to whatever starts after you save them; a running download keeps the options it started with.

## Proxy

In **Proxy address**, type the full address, for example `socks5://127.0.0.1:1080` or `http://proxy.example.com:3128`. The `http`, `https`, `socks4`, `socks4a`, `socks5` and `socks5h` schemes are accepted, followed by the server (name, IPv4, or IPv6 in brackets) and, if needed, the port.

- The address is saved when you leave the field or press <kbd>Enter</kbd>, and only if it's valid. While it has an error, the last valid address is kept.
- To stop using the proxy, clear the field.
- With no proxy in ymd, yt-dlp connects as it would on its own; for example, it honors the `HTTP_PROXY` and `HTTPS_PROXY` environment variables if they are set.

:::caution[The proxy sees your traffic]
The proxy knows which sites you connect to and when. Use one you trust, such as your own or your organization's.
:::

### No user name or password

ymd doesn't accept an address with a user name or password (`http://user:password@server:8080`) and says so in the field. The reason: that address would have to be stored in the settings file in plain text and passed to yt-dlp as an argument, where other programs on the computer can read it. ymd keeps no secrets on disk or in process arguments.

If your proxy requires authentication, use one that authorizes by IP address, or a local proxy without a password that forwards to yours.

### socks5 or socks5h

With `socks5://` (and `socks4://`), your computer resolves the site's name with your usual DNS server, which sees which sites you connect to even though the traffic goes through the proxy. With `socks5h://` (and `socks4a://`), the proxy resolves the names. If you don't want your local network to see the site names, use `socks5h://`.

## Connection

- **IP version**: **Automatic** (the default) lets yt-dlp use whichever answers. **IPv4 only** helps when the IPv6 connection fails or a site blocks it. **IPv6 only** is useful only if your network has IPv6.
- **Timeout**: how long to wait for the server to answer before giving the connection up: **yt-dlp default** (currently 20 s), 10, 20, 30 or 60 s.
- **Retries**: how many times to retry a download or fragment that fails: **yt-dlp default** (currently 10), 3, 10, 20 or 50.

With a proxy that doesn't answer, a short timeout and few retries make the error show up sooner. ymd shows it as [The connection dropped](/ymd/en/solucion-de-problemas/#the-connection-dropped).

## Speed

**Speed limit**: **No limit** (the default), 1, 2, 5, 10, 20 or 50 MB/s, or **Other…** to type a whole number between 1 and 1000. Each download applies that cap separately, and with aria2c the cap applies to aria2c too. The limit applies to downloads that start after you save it; running ones keep the speed they started with.

## What these settings don't cover

ymd's update check and the download of its tools (yt-dlp, ffmpeg, Node.js and the rest in **Dependencies**) don't use the proxy from **Settings → Network**. They follow the system proxy set in the `HTTP_PROXY` and `HTTPS_PROXY` environment variables.

No setting in this section turns off TLS certificate verification.

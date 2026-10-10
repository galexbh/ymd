---
title: Extension privacy
description: Privacy policy of the “ymd Cookies” extension.
---

“ymd Cookies” handles authentication data (cookies) for a single purpose: handing it to the ymd desktop application on the same computer, so yt-dlp downloads with your session.

- **What it collects:** the cookies of the sites on the list you control (only YouTube by default): name, value, domain, path, expiry and security flags, plus the browser's name. When you use **Download with ymd**, the link you picked.
- **Where it goes:** only to ymd, installed on your computer, through the browser's Native Messaging channel. It never travels over the network, never reaches the developer and is never shared with or sold to third parties.
- **What the extension stores:** your site list, the time and size of the last send, the last error, whether your YouTube session is active, and a one-way fingerprint of the cookie set. It stores no cookie values.
- **What ymd stores:** it writes the cookies to a file in its data folder, encrypted with a key from the system keychain and readable only by your user, and uses it solely to run yt-dlp for you.
- **How to stop sharing:** remove the site from the list or uninstall the extension. **Delete copy**, in ymd's **Settings → Accounts**, deletes the copy.
- **Analytics and tracking:** none.
- **Contact:** open an issue in the [ymd repository](https://github.com/galexbh/ymd/issues).

More technical detail in [Cookie bridge protocol](/ymd/en/desarrollo/puente-de-cookies/).

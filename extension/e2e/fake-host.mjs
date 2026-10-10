// A stand-in for ymd's native host (cookie bridge contract, "Transport" section of
// website/src/content/docs/desarrollo/puente-de-cookies.md): reads one framed message from
// stdin, appends it to a record file, writes one framed reply and exits.
//
//   node fake-host.mjs <record-file> <allowed-origin> chrome-extension://<id>/ [--parent-window=N]
import { appendFileSync } from "node:fs";

const [recordFile, allowedOrigin, origin] = process.argv.slice(2);

if (origin !== allowedOrigin) {
  appendFileSync(recordFile, `${JSON.stringify({ rejectedOrigin: origin ?? null })}\n`);
  process.exit(1);
}

// The browser keeps stdin open until we reply, so parse as soon as one frame is complete.
const chunks = [];
process.stdin.on("data", (c) => {
  chunks.push(c);
  handle(Buffer.concat(chunks));
});

let done = false;
function handle(buf) {
  if (done || buf.length < 4) return;
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) return;
  done = true;
  const message = JSON.parse(buf.subarray(4, 4 + len).toString("utf8"));
  appendFileSync(recordFile, `${JSON.stringify(message)}\n`);

  let reply;
  if (message.type === "hello") {
    reply = { ok: true, app: "ymd", appVersion: "0.0.0-e2e", protocol: 1 };
  } else if (message.type === "cookies") {
    const domains = [
      ...new Set(
        message.cookies.map((c) => c.domain.replace(/^\./, "").split(".").slice(-2).join(".")),
      ),
    ];
    reply = { ok: true, count: message.cookies.length, domains };
  } else {
    reply = { ok: false, code: "bad_message", detail: "unknown type" };
  }
  const body = Buffer.from(JSON.stringify(reply), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([head, body]), () => process.exit(0));
}

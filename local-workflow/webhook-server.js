#!/usr/bin/env node
// Minimal local webhook receiver for zapmail-mcp v3 testing.
// Expose this via `cloudflared tunnel --url http://localhost:<port>` and register
// the resulting https URL with create_webhook_endpoint.
//
// Usage: node local-workflow/webhook-server.js [port]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const EVENTS_LOG = path.join(DATA_DIR, "webhook-events.jsonl");
const DOMAINS_FILE = path.join(DATA_DIR, "domains.json");
const MAILBOXES_FILE = path.join(DATA_DIR, "mailboxes.json");
const EXPORTS_FILE = path.join(DATA_DIR, "exports.json");

const PORT = Number(process.argv[2] || process.env.WEBHOOK_PORT || 8787);

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function appendLine(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

function upsertDomainEvent(event) {
  const store = readJson(DOMAINS_FILE, { domains: {} });
  const domain = event.payload?.domain || event.payload?.name || event.payload?.id;
  if (!domain) return;
  const key = String(domain);
  store.domains[key] = {
    ...(store.domains[key] || {}),
    ...event.payload,
    lastEvent: event.type,
    lastUpdated: event.receivedAt,
  };
  writeJson(DOMAINS_FILE, store);
}

function upsertMailboxEvent(event) {
  const store = readJson(MAILBOXES_FILE, { mailboxes: {} });
  const id = event.payload?.id || event.payload?.username || event.payload?.email;
  if (!id) return;
  const key = String(id);
  store.mailboxes[key] = {
    ...(store.mailboxes[key] || {}),
    ...event.payload,
    lastEvent: event.type,
    lastUpdated: event.receivedAt,
  };
  writeJson(MAILBOXES_FILE, store);
}

function upsertExportEvent(event) {
  const store = readJson(EXPORTS_FILE, { exports: {} });
  const id = event.payload?.exportId || event.payload?.export_id || event.payload?.id;
  if (!id) return;
  const key = String(id);
  store.exports[key] = {
    ...(store.exports[key] || {}),
    ...event.payload,
    lastEvent: event.type,
    lastUpdated: event.receivedAt,
  };
  writeJson(EXPORTS_FILE, store);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(404).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400).end("invalid json");
      return;
    }

    const event = {
      receivedAt: new Date().toISOString(),
      type: parsed.type || parsed.event || "unknown",
      headers: {
        "x-zapmail-signature": req.headers["x-zapmail-signature"] || req.headers["x-webhook-signature"] || null,
      },
      payload: parsed.data?.object || parsed.data || parsed.payload || parsed,
      raw: parsed,
    };

    appendLine(EVENTS_LOG, event);

    if (String(event.type).startsWith("domain.")) upsertDomainEvent(event);
    if (String(event.type).startsWith("mailbox.")) upsertMailboxEvent(event);
    if (String(event.type).startsWith("export.")) upsertExportEvent(event);

    console.log(`[webhook] ${event.receivedAt} ${event.type}`);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
  });
});

server.listen(PORT, () => {
  console.log(`Webhook receiver listening on http://localhost:${PORT}`);
  console.log(`Events log: ${EVENTS_LOG}`);
  console.log(`Domains snapshot: ${DOMAINS_FILE}`);
  console.log(`Mailboxes snapshot: ${MAILBOXES_FILE}`);
  console.log(`Now run: cloudflared tunnel --url http://localhost:${PORT}`);
});

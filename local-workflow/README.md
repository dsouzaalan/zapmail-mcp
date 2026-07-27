# Local v3 workflow: webhook → domain purchase → mailbox assignment

## One-time setup

1. Fill in real credentials in `.env` (repo root, gitignored): `ZAPMAIL_API_KEY`, `ZAPMAIL_WORKSPACE_KEY`, `ZAPMAIL_SERVICE_PROVIDER`.
2. The MCP server is registered with Claude Code as `zapmail-local`, running
   `node --env-file=.env src/index.js` (loads `.env` natively, no dotenv dependency).
   Restart/reconnect Claude Code after editing `.env` so the server picks up new values.

## Per-session flow

1. **Start the webhook receiver** (stores everything to JSON):
   ```
   node local-workflow/webhook-server.js 8787
   ```
   Writes to `local-workflow/data/`:
   - `webhook-events.jsonl` — append-only raw log of every event received
   - `domains.json` — latest snapshot per domain, keyed by domain name
   - `mailboxes.json` — latest snapshot per mailbox, keyed by id/username

2. **Start the Cloudflare tunnel** pointing at the same port:
   ```
   cloudflared tunnel --url http://localhost:8787
   ```
   Copy the `https://<random>.trycloudflare.com` URL it prints.

3. **Register the webhook endpoint** — in a Claude Code prompt (with the
   `zapmail-local` MCP connected), ask to call `create_webhook_endpoint` with:
   - `url`: the trycloudflare URL from step 2
   - `enabled_events`: e.g. `["domain.status_changed", "mailbox.status_changed"]`

   The response includes the endpoint id (and any signing secret returned by
   the API) — that's your live webhook destination.

4. **Purchase domains** — prompt Claude to call `check_domain_availability`
   then `purchase_domains`. Webhook events (`domain.status_changed`) will land
   in the receiver and update `domains.json` automatically.

5. **Assign mailboxes** — prompt Claude to call `create_mailboxes_for_zero_domains`
   (or `bulk_update_mailboxes`) for the purchased domains. `mailbox.status_changed`
   events update `mailboxes.json` automatically.

6. **Review** — tail `webhook-events.jsonl` for the raw timeline, or open
   `domains.json` / `mailboxes.json` for current state snapshots.

Everything under `local-workflow/data/` is gitignored — it's local run output, not committed.

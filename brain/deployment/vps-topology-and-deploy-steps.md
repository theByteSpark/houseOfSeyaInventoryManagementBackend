# Deployment: VPS Topology & Deploy Steps

> **Purpose:** What's actually running on the production VPS (apps, ports, pm2 names, nginx sites) and the exact steps to deploy a backend change. Read this before touching pm2 or nginx on the server — most deploy incidents so far have come from guessing a port or a process name instead of checking this table.
>
> **Related docs:** `troubleshooting-checklist.md` (when a deploy goes wrong) · `../foundation/setup.md` (local env vars, same shape as production's `.env`)

---

## VPS Topology — Every App on This Box

This VPS hosts multiple unrelated apps for multiple clients, not just House of Seya. Always check this table before assigning a port or a pm2 name — two apps silently sharing one port is the single worst incident so far (see `troubleshooting-checklist.md` #2).

| App | Directory | pm2 process name | Port | Database |
|---|---|---|---|---|
| House of Seya Inventory (this repo) | `/opt/houseofseya_inventory/backend` | `houseofseya-inventory-api` | **5300** | `houseofseya_inventory` |
| bytespark_inventory (separate client/demo) | `/opt/bytespark_inventory/backend` | `bytespark_inventory-api` | **5400** | `bytespark_inventory` |
| House of Seya Admin (separate app) | `/opt/houseofseya/backend` | `houseofseya-admin` | 5200 | `houseofseya_admin` |
| Paragon Resin | `/opt/paragonresin/backend` | `paragon-api` | 5100 | `paragon_inventory` |
| email-agent | `/opt/apps/email-agent` | `email-agent` | — | — |

`bytespark_inventory-api` was moved from 5300 → 5400 on 2026-10-15 to resolve a port collision with this app — see `troubleshooting-checklist.md` #2 for the full story. **Before ever assigning a new port to any app on this VPS, run `ss -ltnp` and check it against this table first.**

## nginx Site Files (`/etc/nginx/sites-available/`, all symlinked into `sites-enabled/`)

| Site file | Domain(s) | Proxies to |
|---|---|---|
| `bytespark-projects` | `inventory.houseofseya.com` (frontend, static), `api-inventory.houseofseya.com` (backend) | `127.0.0.1:5300` |
| `bytespark_inventory` | `inventory.thebytespark.com` (frontend, static), `api-inventory.thebytespark.com` (backend) | `127.0.0.1:5400` |
| `houseofseya` | `admin.houseofseya.com` (frontend, static), `admin-api.houseofseya.com` (backend) | `127.0.0.1:5200` |
| `bytespark-chatbot` | (separate app, not covered here) | — |

**Known issue, not yet fixed:** `nginx -t` currently warns `conflicting server name "admin.houseofseya.com"` / `"admin-api.houseofseya.com"` — duplicated between `bytespark-projects` and `houseofseya`. Hasn't caused an outage yet (not this app's domain), but should be cleaned up — pick one file to own those two server blocks and delete the duplicate from the other.

## Routine Deploy Steps

Run these in order, inside `/opt/houseofseya_inventory/backend`:

1. `git pull`
2. `npm install --omit=dev`
3. `npx prisma generate`
4. `npx prisma migrate deploy`
5. `npm run build` — **do not skip this.** The old deploy habit omitted it; without it, `dist/` can silently fall behind `src/` and you'll be debugging stale code without realizing it.
6. `pm2 restart houseofseya-inventory-api --update-env`

### Exit Condition

- `pm2 describe houseofseya-inventory-api` shows `status: online` and `exec cwd: /opt/houseofseya_inventory/backend`.
- Wait ~20 seconds untouched, then check again — `restarts` should not have climbed. A climbing count after a clean restart means something is wrong; go to `troubleshooting-checklist.md`.
- `curl -s https://api-inventory.houseofseya.com/health` returns `{"status":"ok"}`.

## If This Process Has Never Been Started Before (or Was Deleted)

Never start it via `pm2 start npm --name houseofseya-inventory-api -- run start` — going through the `npm` wrapper has caused real instability in this app's history (see `troubleshooting-checklist.md` #1). Always launch the compiled file directly, from inside the correct directory:

```
cd /opt/houseofseya_inventory/backend
pm2 start dist/server.js --name houseofseya-inventory-api --time
pm2 save
```

`--time` prefixes every log line with pm2's own timestamp — keep this on for any process you expect to debug later. `pm2 save` persists the corrected process list so a VPS reboot doesn't resurrect a stale/broken config.

# Deployment: VPS Troubleshooting Checklist

> **Purpose:** Symptom → diagnosis → fix, for problems on the production VPS. Every entry here actually happened during the 2026-10-15 production incident (env vars not loading, CORS/500s, a silent restart loop) — written immediately after, from the real commands that found each root cause, so the next incident doesn't re-walk the same multi-hour path.
>
> **Related docs:** `vps-topology-and-deploy-steps.md` (ports, pm2 names, nginx map, routine deploy)

---

## 1. App won't start — `pm2 logs` shows `Invalid environment variables: { ... received undefined }` even though `.env` has the right values

**Cause:** `src/config/env.ts` loads `.env` via `import 'dotenv/config'`, which reads `.env` from the process's current working directory — not from wherever the script file lives. If pm2 launched the process from the wrong directory, every required var reads as `undefined` no matter how correct the file on disk is.

**Diagnose:**
```
pm2 describe houseofseya-inventory-api | grep "exec cwd"
```
If this isn't `/opt/houseofseya_inventory/backend`, that's the whole bug.

**Fix:** `pm2 restart` does **not** fix this — it replays the same stored (wrong) launch config. You must delete and relaunch from the correct directory:
```
pm2 delete houseofseya-inventory-api
cd /opt/houseofseya_inventory/backend
pm2 start dist/server.js --name houseofseya-inventory-api --time
pm2 save
```

**Exit condition:** `exec cwd` now shows the correct path, and the "CORS allowlist loaded" boot log line shows the real `.env` values, not defaults.

---

## 2. Process restarts every 1-5 seconds, forever, with **zero error text** in either `out` or `error` log

**Cause (confirmed 2026-10-15):** another, completely unrelated app on this VPS was already bound to the same port. Two processes fighting over one port produces exactly this signature — whichever one wins the bind at a given moment runs for a few seconds until the loser's pm2 respawn attempt collides with it again. No JS exception is ever thrown, so nothing ever appears in the error log — this is the detail that makes it look like a mysterious crash when it's actually a port collision.

**Do not assume it's the app's own code.** Ruling that out first is what actually found this:
```
ss -ltnp | grep <port>
```
If the pid/process name shown is **not** this app, that's the cause, full stop — skip everything else.

**Other things that looked plausible but were NOT the cause, in this exact incident** (ruled out in order, don't re-walk this path):
- Launching via `pm2 start npm --name x -- run start` instead of `pm2 start dist/server.js` directly — switching to a direct launch did **not** stop the loop. (Still worth doing anyway — see `vps-topology-and-deploy-steps.md` — just wasn't the fix here.)
- `pm2`'s `wait_ready`/`listen_timeout` feature — `pm2 describe` showed no such config active.
- A competing cron job, systemd unit, or second pm2 daemon — checked via `crontab -l`, `systemctl list-units --all | grep <name>`, `ps aux | grep pm2` — none found.
- An uncaught exception or native crash (e.g. Prisma engine segfault) — ruled out by running the compiled file directly in the foreground (`node dist/server.js`, no pm2) and separately with `timeout 15 node dist/server.js; echo "EXIT CODE: $?"` — if the app only dies once something else also binds the port, these direct-foreground tests will show a clean, silent `EXIT CODE: 0` with no stack trace, which is itself a strong signal to go check `ss -ltnp` rather than keep looking for a code bug.

**Fix:** move one of the two apps to a free port — update its `.env`'s `PORT`, update its nginx `proxy_pass` to match, `nginx -t && systemctl reload nginx`, then restart that app's pm2 process with `--update-env`.

**Exit condition:** `pm2 describe <name>` shows `restarts: 0` holding steady for a full minute of being left alone (don't just check immediately after restarting).

---

## 3. CORS error in the browser's Network tab, but `curl` with the same `Origin` header returns a clean `200` and a correct JSON body

**Cause to check first:** the browser enforces CORS rules that `curl` doesn't — a response with **more than one** `Access-Control-Allow-Origin` header (even if both copies have the identical value) is rejected by the browser as invalid, and it hides the response body from DevTools, which looks exactly like "no response" even though the server really did send one.

**Diagnose — get an unambiguous count, don't eyeball raw headers:**
```
curl -s -D - -o /dev/null https://<api-host>/<endpoint> -X POST -H "Origin: https://<frontend-host>" ... | grep -ci "^Access-Control-Allow-Origin"
```
- `1` → not a duplicate-header problem, look elsewhere (wrong allowed origin, cookie `SameSite`/`Secure` mismatch across subdomains, or a genuine app bug after login).
- `2` (or more) → confirmed duplicate. Find the second source: this app's `cors()` middleware is only wired once in `src/app.ts` (verified by `grep -rln "cors(" src/` — should return only `app.ts`), so check nginx next: `grep -rn "Access-Control" /etc/nginx/nginx.conf /etc/nginx/conf.d/ /etc/nginx/snippets/ /etc/nginx/sites-available/`. If nginx is also clean, the next suspect is a second CORS-handling layer (a CDN/WAF in front of the domain, or a leftover manual header-setting line anywhere in `src/` — re-grep case-insensitively: `grep -rniE "access-control|setHeader" src/`).

**Separately, always sanity-check the basics while in here:**
- Confirm the `Origin` header sent by the real browser request matches an entry in `CORS_ORIGINS` **exactly** (protocol + host, no trailing slash).
- Confirm `.env` actually loaded (see #1) — the boot log's `CORS allowlist loaded: [...]` line is the fastest way to see what the running process actually has, without guessing from the file on disk.

---

## 4. `500 Internal Server Error` specifically on an `OPTIONS` preflight request

**Cause:** an `OPTIONS` preflight never reaches any route handler — it's fully handled by the `cors` middleware itself. A `500` here means the error is being thrown *inside* the CORS origin-check callback in `src/app.ts`, which only happens when the request's `Origin` is not found in the computed `allowedOrigins` array.

**Diagnose:** check the boot log line `CORS allowlist loaded: [...]` (added in `src/app.ts`) against the exact `Origin` the request is sending. If the expected origin isn't in that list, work backward through #1 (env not loading) before assuming the `.env` file itself is wrong — in this incident the file was correct, but the running process wasn't reading it due to the `exec cwd` bug.

---

## 5. Need to trace what a request actually did, after the fact

This app logs through `src/utils/logger.ts` (`logger.info/warn/error`, each line timestamped with `new Date().toISOString()`) — added 2026-10-15 specifically because the default `console.error(err)` gave no timestamp and no way to correlate a log line with a specific request during a live incident. Every request logs method/path/`Origin` on the way in, both CORS branches log their decision, and `errorHandler.ts` logs all three error types (`ApiError`, `ZodError`, unhandled) tagged with `METHOD /path`.

Combine with pm2's own `--time` flag (set once at launch, see `vps-topology-and-deploy-steps.md`) for a second, process-level timestamp — useful because pm2's timestamp survives even if the app crashes before its own log line flushes.

`pm2 logs houseofseya-inventory-api --lines 200 --nostream | grep -iE "error|cors|rejected"` is the fastest way to find a specific incident after the fact.

# Push Notifications — Implementation Plan

Status: proposal. Two phases, built in order: **Phase 1** (real-time in-app,
via WebSocket) ships first and is the bigger unlock for the least effort;
**Phase 2** (OS-level browser push) layers on top once Phase 1 is stable.

## Current state (baseline)

- Notifications are polled: `useNotifications()` / `useUnreadNotificationCount()`
  call `GET /notifications` and `GET /notifications/unread-count` every 30s
  (`src/features/notifications/hooks.ts`, frontend repo).
- Backend writes a `Notification` row + (lazily, per-viewer) computes read
  state via `NotificationRead`. Nothing pushes to clients today.
- Backend is a single Express app on a plain `http.Server`
  (`app.listen()` in `src/server.ts`) — no existing WebSocket/SSE layer.
- Frontend is a plain Vite SPA — no service worker, no manifest, deployed
  as static files to Vercel (`vercel.json` just rewrites all routes to
  `index.html`).
- No `web-push` or `ws`/`socket.io` dependency in either repo yet.

## Phase 1 — Real-time in-app (WebSocket)

Goal: while a user has the app open, the bell/badge update within ~1s of
another user's action, no polling delay. No OS permission prompt, no
service worker.

### Why WebSocket over SSE here

Both would work. WebSocket is chosen because:
- The app already has an authenticated, stateful connection model (JWT
  access token); a `ws` upgrade can reuse the same token via a query param
  or the initial handshake message.
- Future phases (e.g. live stock updates from the earlier PWA discussion)
  are bidirectional-shaped; SSE is one-way only, so WebSocket avoids a
  second migration later. If a strict one-way channel is preferred instead,
  SSE is a valid substitute in this same phase with a smaller server-side
  footprint (no `ws` dependency, just a long-lived HTTP response) — flag if
  you'd rather do that.

### Backend changes

1. **Add `ws` dependency.** (`npm install ws @types/ws`)
2. **Attach a WebSocket server to the existing HTTP server** in
   `src/server.ts` — `app.listen()` returns the underlying `http.Server`;
   pass that same instance to `new WebSocketServer({ server })` rather than
   creating a second listener. No new port, no new deployment target.
3. **New `src/modules/notifications/ws.ts`**: on connection, expect the
   client to send its access token as the first message (or via a `?token=`
   query param on the upgrade request); verify it the same way
   `authenticate.ts` does (`verifyAccessToken`); reject/close the socket if
   invalid. Store connected sockets keyed by `userId` (a `Map<string,
   Set<WebSocket>>` to allow multiple tabs per user).
4. **Broadcast helper**: extend `notifications.service.ts`'s
   `createNotification()` — after writing the row, resolve which connected
   users should receive it (same visibility rule already used by
   `listNotifications`: company-level roles + users mapped to the
   notification's `warehouseId`, or everyone if `warehouseId` is null) and
   push a small JSON payload (`{ type: 'notification', id, title, ... }`)
   over each of their open sockets.
5. **Reconnection is the client's job** (see frontend below) — the server
   stays simple: accept a connection, authenticate it, drop it on
   disconnect, nothing to persist server-side beyond the in-memory map.
6. **No schema change** — this phase only adds a delivery path for
   notifications that already exist; `Notification`/`NotificationRead`
   stay as-is.

### Frontend changes

1. **New `src/lib/notificationSocket.ts`**: opens a WebSocket to the
   backend (`wss://` in prod, `ws://` in dev — same host/port as
   `VITE_API_URL`, different scheme), sends the access token on connect,
   auto-reconnects with backoff on close/error (simple exponential backoff,
   capped), no external library needed for this scale.
2. **Wire into `features/notifications/hooks.ts`**: on receiving a
   `notification` message, call
   `queryClient.invalidateQueries({ queryKey: notificationKeys.all })` and
   `...unreadCount` — reuses 100% of the existing React Query/UI code path,
   so `NotificationBell.tsx` needs zero changes. The 30s poll stays as a
   safety net (covers the reconnect gap) but effectively becomes a
   fallback, not the primary delivery path.
3. **Connect/disconnect lifecycle**: open the socket once `useAuth()`
   reports `isAuthenticated`, close it on logout — hook this into
   `AuthProvider` (`features/auth/useAuth.tsx`) alongside the existing
   token bootstrap logic.

### Effort estimate

- Backend: ~0.5–1 day (dependency, WS server, auth handshake, broadcast
  wiring into the one existing `createNotification()` call site).
- Frontend: ~0.5 day (socket client, reconnect logic, hook into
  `AuthProvider` + notifications hooks).
- Testing: verify via two browser sessions (as done for the polling
  version) — trigger an event as user A, confirm user B's badge updates
  within ~1s instead of ~30s.

### Deployment impact

- **Backend (Railway or similar)**: needs to support persistent WebSocket
  connections — most modern PaaS (Railway, Fly.io, Render) support this by
  default since they proxy raw TCP/HTTP upgrades. Confirm the specific host
  doesn't sit behind a strict reverse proxy that drops `Upgrade` headers
  (rare, but worth a smoke test post-deploy).
- **Frontend (Vercel)**: no change — Vercel only serves static files; the
  WebSocket connects directly to the backend host, not through Vercel.
- **CORS**: the existing `cors()` origin allow-list in `app.ts` doesn't
  apply to WebSocket upgrades the same way; add an explicit origin check in
  the WS upgrade handler using the same `allowedOrigins` list already
  defined there.

## Phase 2 — OS-level browser push

Goal: a real OS notification popup arrives even if the browser is closed
or the tab isn't focused. This is the part that needs the browser's native
permission prompt and a service worker.

### Backend changes

1. **Add `web-push` dependency**, generate a VAPID key pair once
   (`web-push generate-vapid-keys`), store the public/private key in env
   vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, plus a contact email as
   required by the Push API spec).
2. **Schema addition**: new `PushSubscription` model — `(id, userId,
   endpoint, p256dh, auth, createdAt)`, one row per browser/device a user
   has granted permission on (a user can have several: desktop Chrome,
   phone, etc.). `@@unique([userId, endpoint])`.
3. **New endpoints**: `POST /push/subscribe` (client sends the
   `PushSubscription` object from the browser, upsert it),
   `POST /push/unsubscribe` (remove on logout or when the user disables
   notifications).
4. **Extend `createNotification()`**: alongside the WebSocket broadcast,
   look up `PushSubscription` rows for the same recipient set and call
   `webpush.sendNotification(subscription, payload)` for each — wrap in
   try/catch per-subscription (a stale/expired subscription shouldn't block
   others; on a 410 Gone response, delete that subscription row).

### Frontend changes

1. **Service worker** (`public/sw.js` or generated via `vite-plugin-pwa` —
   this is the same file the earlier PWA discussion would need, so if PWA
   conversion happens too, this is shared groundwork, not duplicated
   effort): handle the `push` event, call `self.registration.showNotification(...)`
   with the payload; handle `notificationclick` to focus/open the relevant
   app page.
2. **Permission + subscribe flow**: a settings toggle ("Enable push
   notifications") that calls `Notification.requestPermission()`, then
   `registration.pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey: VAPID_PUBLIC_KEY })`, then POSTs the resulting
   subscription to the backend. Must be a deliberate user action (button
   click), not automatic on page load — browsers block/penalize
   auto-prompted permission requests, and it's a poor first impression.
3. **HTTPS requirement**: the Push API only works over HTTPS (or
   `localhost` for dev). Vercel already serves HTTPS in prod; local dev
   works fine since `localhost` is exempt.

### Effort estimate

- Backend: ~1 day (VAPID setup, subscription storage/endpoints, send-on-
  notification wiring with per-subscription error handling).
- Frontend: ~1–1.5 days (service worker, permission UI, subscribe/
  unsubscribe flow, icon/badge assets for the OS notification).
- Testing: real device/browser testing needed here (can't fully verify
  OS-level popups via curl) — test on at least Chrome desktop + one mobile
  browser (Android Chrome supports it well; iOS Safari push support is
  more limited/recent and worth explicitly checking against your target
  user base before committing effort here).

### Deployment impact

- No new backend infra beyond the `web-push` library and two new env vars.
- Frontend still deploys as static files to Vercel — the service worker is
  just another file in the build output.

## Suggested sequencing

1. Phase 1 backend (WS server + broadcast).
2. Phase 1 frontend (socket client + hook into existing notification
   UI) — ship and use for a bit before adding Phase 2 complexity.
3. Phase 2 backend (VAPID + subscriptions + send wiring).
4. Phase 2 frontend (service worker + permission flow).

Each phase is independently shippable and phase 1 alone already solves
"why didn't I see this for 30 seconds" — phase 2 is additive for the
closed-tab/backgrounded case.

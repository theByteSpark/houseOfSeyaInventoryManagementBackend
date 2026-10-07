# Deploy steps

Production: `api-paragon.thebytespark.com`, VPS `vmi3384440`, path `/opt/paragonresin/backend`, pm2 app `paragon-api`, port `5100`. No Docker, no git on VPS. Build locally, ship built output only.

## 1. Build locally

```bash
cd /Users/deadpool/Desktop/Projects/houseOfSeyaInventoryManagementBackend

npm install
npx prisma generate
npm run build
```

## 2. Copy to VPS

Copy: `dist/`, `prisma/`, `package.json`, `package-lock.json`.
Do **not** copy: `node_modules/`, `.env`.

```bash
rsync -av \
  dist/ prisma/ package.json package-lock.json \
  root@vmi3384440:/opt/paragonresin/backend/
```

## 3. On the VPS

```bash
cd /opt/houseofseya_inventory/backend

npm install --omit=dev
npx prisma generate
npx prisma migrate deploy
pm2 restart houseofseya_inventory-api
```

## 4. Verify

```bash
pm2 logs paragon-api --lines 30 --nostream
curl -s http://localhost:5100/api/v1/warehouses -H "Authorization: Bearer <a-valid-token>"
```

## Frontend

Build locally (`npm install && npm run build`), copy `dist/` to wherever it's hosted. No backend restart needed. Deploy backend first if the API contract changed.

---

# Common issues

**500 error, don't know why**
Check `pm2 logs paragon-api --lines 50 --nostream` for the real stack trace — the API's own error response is generic.

**Prisma error about an enum/column/table that "should" exist**
`npx prisma migrate status` can say "up to date" even when it isn't. Cross-check the DB directly:
```bash
npx prisma db execute --stdin <<< "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'SaleStatus';"
```
(`db execute` doesn't print `SELECT` output — for that use a one-off Node script with `PrismaClient`/`$queryRawUnsafe`, or `psql` if available.)

**DB looks correct but app still errors on a type/enum mismatch**
Stale Prisma Client on the VPS. Run `npx prisma generate` on the server itself, then `pm2 restart paragon-api`.

**"Engine not found for this platform" / binary errors**
`node_modules/.prisma` was copied from your Mac instead of generated on the VPS (Prisma's query engine is platform-specific). Delete `node_modules/.prisma` on the server and re-run `npx prisma generate` there.

**A migration was marked applied but never actually ran**
Don't paper over it with `prisma migrate resolve --applied`. Check the real DB state (see enum check above), and if it's actually broken, roll back and re-apply or write a corrective migration.

---

# Reference

- DB: local Postgres on the VPS, `paragon_inventory`, `localhost:5432`
- App DB user: `paragon_api` — not table owner, so some raw DDL needs the `postgres` superuser instead
- Other pm2 apps on this box, don't restart by accident: `email-agent`, `inventory-backend`

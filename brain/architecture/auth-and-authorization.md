# Auth & Authorization

> **Purpose:** How login, sessions, and role checks actually work — the exact token flow, not just "JWT is used somewhere."
>
> **Related docs:** `module-conventions.md` (where `authenticate`/`authorize` get applied) · `../database/schema-overview.md` (`User`, `PasswordResetToken` models)

---

## The Two Tokens

| Token | Lifetime (default) | Where it lives | Signed with |
|---|---|---|---|
| Access token | 15m (`JWT_ACCESS_EXPIRES_IN`) | Sent in `Authorization: Bearer <token>` header, held in frontend memory only | `JWT_ACCESS_SECRET` |
| Refresh token | 7d (`JWT_REFRESH_EXPIRES_IN`) | httpOnly cookie (set by the auth routes, read via `cookie-parser`) | `JWT_REFRESH_SECRET` |

Two separate secrets on purpose — compromising one doesn't compromise the other. The refresh token's **hash** (bcrypt) is stored on the `User` row (`refreshToken` column); the raw refresh token is never persisted server-side, only compared against the stored hash.

## Login Flow (`src/modules/auth/auth.service.ts`)

1. `login(email, password)` — looks up the user, `bcrypt.compare`s the password, throws `ApiError.unauthorized('Invalid email or password.')` on any mismatch (deliberately the same message whether the email doesn't exist or the password is wrong — don't leak which one failed).
2. On success, `issueTokens(userId, role)` signs both tokens, bcrypt-hashes the refresh token, and stores the hash on the user row.
3. Response: `{ user: PublicUser, accessToken, refreshToken }` — see `auth.controller.ts` for exactly how the refresh token becomes an httpOnly cookie vs. how the access token goes in the JSON body.

## Refresh Flow

1. Frontend's `apiClient` (see the frontend repo's `src/lib/apiClient.ts`) calls `POST /api/v1/auth/refresh` automatically on a 401, using the httpOnly cookie — no manual header needed.
2. `refresh(refreshToken)` verifies the JWT signature/expiry, then **also** bcrypt-compares it against the stored hash on that user — a token that's valid but has been superseded (e.g. after logout) fails this second check.
3. Success issues a brand-new access + refresh token pair (rotation) and overwrites the stored hash — the old refresh token cannot be reused even if it hasn't expired yet.

## Logout

`logout(userId)` sets `refreshToken` to `null` on the user row. Any refresh token issued before logout immediately fails the stored-hash comparison on its next use, even if not yet expired — this is the mechanism, not token blacklisting.

## Password Reset (Email Code, Not a Link)

1. `forgotPassword(email)` — always returns success even for a nonexistent email (prevents email enumeration). If the user exists, generates a random 6-digit code, bcrypt-hashes it into a new `PasswordResetToken` row (10-minute TTL, `RESET_CODE_TTL_MS`), and emails it via Resend (`src/utils/mailer.ts`).
2. `verifyResetCode(email, code)` — finds the newest non-consumed, non-expired token for that email, bcrypt-compares the code, marks it `consumedAt` on success, and returns a short-lived **password-reset JWT** (`signPasswordResetToken`, separate purpose from access/refresh tokens).
3. `resetPassword(resetToken, newPassword)` — verifies that reset-specific JWT, hashes the new password, and clears `refreshToken` on the user (forces re-login everywhere — see `resetPassword`'s `data: { passwordHash, refreshToken: null }`).

This three-step flow exists so the frontend can show "enter the code" and "set a new password" as separate screens without re-sending the email.

## Middleware

| Middleware | File | Behavior |
|---|---|---|
| `authenticate` | `src/middleware/authenticate.ts` | Requires `Authorization: Bearer <token>`, verifies it, sets `req.user = { id, role }`. Throws `ApiError.unauthorized` on anything missing/invalid — never silently continues unauthenticated. |
| `authorize(...roles)` | `src/middleware/authorize.ts` | Must run *after* `authenticate`. Throws `ApiError.forbidden` if `req.user.role` isn't in the given list. |

Applied per-router as `router.use(authenticate)` (every route needs login) and per-route as `authorize('ADMIN')` where needed (see `users.routes.ts` — user management is the one admin-only area today).

## Roles

Exactly two, defined in `prisma/schema.prisma`'s `Role` enum: `ADMIN`, `STAFF`. New roles require a Prisma migration (enum change) plus updating every `authorize(...)` call site that should include or exclude the new role — there's no dynamic permission system, roles are a hardcoded enum by design for this app's size.

## Adding a New Protected Route

1. `router.use(authenticate)` is already applied at the router level for every existing module — a new route in an existing module inherits it automatically.
2. Only add `authorize('ADMIN')` (or similar) if the route should be *more* restrictive than "any logged-in user."
3. Never check `req.user.role` manually inside a controller or service — use the `authorize` middleware so the check happens before the handler runs and stays consistent with every other role-gated route.

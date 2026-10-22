# Accounts and hosting migration

## Current behavior

Login opens a native modal dialog over the current page, including requests triggered by mock exams and guarded account routes. Escape or the close button dismisses it without navigating. The legacy `/login` URL opens the same dialog. Successful login reloads the destination so route-scoped data is loaded for the authenticated account.

Guests can browse lessons, vocabulary and exam setup. Practice is limited to 10 questions per session; a guest may start another session. Actual mock-exam sessions require login. Admins alone create, edit, soft-delete, restore and change passwords through `/admin/users`. Account creation is not public. Deleted usernames remain reserved and learning data is retained. The final active Admin cannot be removed or demoted, including concurrent database updates.

Guest data stays in the existing per-certificate IndexedDB databases. Logging in never imports it automatically. Account data is isolated by user UUID and certificate (`ctfl` or `toeic`). Progress exports use version 3; legacy CTFL v1 and certificate v2 imports remain supported. Vocabulary remains separate from progress export/reset. Lesson settings retain completed slugs and the last opened lesson, not self-check answers. Admin screens do not expose other users' learning records.

Account storage requires an online API. Network/authentication failures show errors and never silently save to guest storage. Keep the session page open and use **Thử lưu lại** after a failed save/submission. Changing identity closes the current session before changing storage. Guest learning remains available offline. Account session changes held only in memory can be lost if the page is closed before saving.

## Architecture

Notes are the exception to certificate-scoped learning: `/api/notes` stores a user's global library in the reserved `global-notes` scope, with record kind `notes`. The authenticated user determines ownership; callers cannot select a user or scope. Guest Notes live in the separate `certificate-notes` IndexedDB database. No guest data is transferred during login. Existing migration exports include this scope automatically; progress imports and resets cannot touch it. Each note update/delete checks its revision to avoid overwriting another tab/device's work.

Notes saves require the online API for accounts. A temporary recovery draft in the current tab's `sessionStorage` is keyed by account UUID or guest identity and only offered to that same owner after reload. It is not a saved account note or an offline synchronization queue. Saving/discarding clears it; closing the tab ends its lifetime. Login and cross-tab account reloads retain the previous owner's dirty draft without displaying it to another owner. Storage failures show a warning to copy/save before leaving.

The initial target is Angular static assets + a Sites Worker + D1 binding `DB` + existing R2 binding `MEDIA`. JWT access tokens last 15 minutes and remain in memory. Refresh tokens rotate, last 7 days and use HttpOnly, Secure in HTTPS, SameSite=Strict cookies. Every authenticated request verifies the live user/session and token version. Role changes, password resets and soft deletion revoke sessions immediately. Passwords use portable salted scrypt hashes; plaintext passwords are never stored.

`server/contracts.ts` defines authentication, learning and snapshot storage ports. `server/api.mjs`, `auth.mjs` and `learning.mjs` implement business behavior; `d1-repository.mjs` and `sites-accounts.mjs` supply the initial adapters. Learning writes stage a new generation and atomically switch its scope pointer with optimistic version checking. Snapshots in private R2 keys contain the original question/answer material so historical results do not change with new banks. Existing public media routes cannot read account snapshots.

Frontend requests use relative `/api` URLs. For a future separate API service, place a reverse proxy at the frontend domain's `/api` path. This preserves the same-origin cookie flow while the Node service and PostgreSQL run elsewhere. A directly cross-origin API would additionally require deliberate CORS, cookie, CSRF and browser privacy policy changes; that deployment mode is not implemented here.

## Local development

Use the pinned Node and pnpm versions. `pnpm start` runs Angular on port 4200 and a Miniflare Worker API on 8788 through `proxy.vocabulary.json`. D1, R2 and the local JWT secret persist under ignored `.account-local/`. Local migrations apply automatically in filename order. `pnpm run start:api` runs only the API. The dictionary endpoint remains available to guests.

If port 4200 is occupied, use `pnpm start --port 4201` (or `--port=4201`). The launcher sets the API's allowed origin to the selected localhost port so login and account writes continue to work. An explicit `APP_ORIGIN` takes precedence; set it to the exact frontend origin when using a custom hostname, HTTPS or the standalone API.

Before starting, supply `BOOTSTRAP_SECRET` with at least 32 random characters using your environment/secret manager. Optionally supply `JWT_SECRET`; otherwise a random local secret is generated. Create the first Admin with `node scripts/bootstrap-account-admin.mjs`. The script reads one JSON object from stdin:

```json
{
  "siteUrl": "http://localhost:4200",
  "secret": "<bootstrap secret>",
  "username": "admin",
  "password": "<11-128 characters>",
  "email": ""
}
```

Use secure stdin input rather than command-line credentials or committed files. Bootstrap is accepted only while the user table is empty. Remove `BOOTSTRAP_SECRET` afterward and restart the API. Accounts are subsequently created through the Admin UI.

## Sites build and operator setup

`pnpm run build:sites` creates Angular assets in `dist/client`, the bundled Worker in `dist/server/index.js` and Drizzle SQL migrations in `dist/drizzle`. `.openai/hosting.json` retains the existing project ID and declares `DB` and `MEDIA`. Use Worker `nodejs_compat` with a compatibility date at least `2026-07-30`. Configure `JWT_SECRET` (32+ random bytes), `APP_ORIGIN` (exact HTTPS site origin, no trailing slash) and temporary `BOOTSTRAP_SECRET` as deployment secrets/bindings. Apply the Drizzle migrations in order using the Sites deployment migration workflow. Build preparation alone neither publishes nor applies production migrations.

Use the bootstrap script against the deployed origin. Private Sites may also require `bypassToken` in its stdin object; this is an operator credential, never a frontend asset. Remove the bootstrap secret after creating the Admin. Test login, refresh, an account save and Admin management before opening access.

App accounts do not bypass the existing ChatGPT Sites audience/access gate. This change does not alter that audience. No production deployment is performed by these scripts automatically.

## Migration and rollback plan

The Node HTTP adapter and PostgreSQL implementation are **phase 2**; this release does not claim they are available. Implement the existing ports against PostgreSQL, preserving UUIDs, normalized unique usernames, scrypt hashes, token versions, certificate scopes and generation semantics. Preserve the atomic last-Admin condition in the PostgreSQL update statement. Supply snapshot storage retaining the same object keys and checksums. A Node reverse-proxy deployment can reuse the API modules and frontend without changing learning behavior.

Before cutover:

1. Back up the source D1 and R2. Deploy and test the target adapters with an isolated copy. Validate users, historical results, restored sessions, vocabulary, bookmarks, lesson state and simultaneous writes.
2. Set source `ACCOUNT_MAINTENANCE=true` and a temporary random 32+ character `MIGRATION_SECRET`. This blocks learning/user mutations and media uploads; existing auth login/refresh/me/logout remain available. Wait for already-running requests to drain before exporting.
3. Sign in as an Admin and run `node scripts/export-account-migration.mjs` with secure JSON stdin containing `siteUrl`, `accessToken`, `secret` and optional `bypassToken`. It exports users, learning scopes/records and all R2 objects to ignored `.account-local/exports/<timestamp>/`. It verifies pagination counts, object byte counts and SHA-256 checksums and writes a manifest plus its checksum. Export includes password hashes and private content: store it as a confidential backup. Auth sessions/rate-limit counters are excluded, so everyone signs in again after migration.
4. Import the manifest into the target in a database transaction, import every object and verify manifest/object checksums and row counts. SQL generated for D1 must not be run directly against PostgreSQL. Account data cannot be reconstructed from public assets alone.
5. Configure fresh JWT secrets and the target origin, then route the frontend `/api` proxy to the Node service. Change the frontend domain only after verifying HTTPS, cookie refresh and route restoration there. Browser guest IndexedDB belongs to its origin and does not follow a domain change; guests can explicitly export/import progress before moving.
6. Retain the old deployment and backup during a defined rollback window. If target verification fails **before any new writes**, point `/api` back to the source, remove maintenance and require login again. Once the target accepts writes, freeze both services and reconcile/export those new writes before rollback; restoring the old source alone would lose them. Remove temporary migration secrets and operator tokens after completion.

The maintenance export endpoints require both an active Admin JWT and `X-Account-Migration-Key`; they are disabled outside maintenance. Never commit the exports, operator credentials or production secrets.

## Verification

`pnpm run test:ci` covers Angular/domain/persistence/auth behavior. `pnpm run test:accounts` exercises the actual bundled Worker with Miniflare D1/R2, including refresh rotation, privilege checks, account/certificate isolation, immutable history and revoked accounts. `pnpm run build:sites` verifies the production frontend and bundled Worker. No new E2E tests are introduced.

The first production deployment rejected migration 0001 before applying it because the hosting SQL parser split trigger bodies. The repaired migration uses a single statement; the repository UPDATE now guards the last active Admin atomically, including concurrent demotions. Migration 0003 removes triggers from local databases that had applied the original local-only migration.

# rollbar

Rollbar error reporting integration for Legacy Sports. Replaces the legacy Sentry integration.

Exposes the same function API as the previous `@legacy-sports/sentry` library for a drop-in migration:

- `initSentry(config)` — initialize Rollbar with a `RollbarConfig`
- `captureError(error, context?, severity?)` — capture an error; `severity` is `'error'` (default) | `'warning'` | `'info'`
- `captureWarning(error, context?)` — shorthand for `captureError` with `severity: 'warning'`
- `captureInfo(error, context?)` — shorthand for `captureError` with `severity: 'info'`
- `addBreadcrumb(message, data?, level?)` — log a breadcrumb
- `withSentry(handler)` — wrap a handler function with automatic error capture
- `getSentryConfigFromEnv()` — read `ROLLBAR_ACCESS_TOKEN` from environment

## Entry Points

| Import path                     | Platform       |
| ------------------------------- | -------------- |
| `@legacy-sports/rollbar`        | Node.js/Lambda |
| `@legacy-sports/rollbar/web`    | Vite / browser |
| `@legacy-sports/rollbar/native` | React Native   |

## Environment Variables

| Variable                           | Description                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ROLLBAR_ACCESS_TOKEN`             | Server-side (post_server_item) token. Used in local dev/CLI; Lambdas prefer `ROLLBAR_ACCESS_TOKEN_SECRET_NAME`.                                                         |
| `ROLLBAR_ACCESS_TOKEN_SECRET_NAME` | AWS Secrets Manager secret name holding the server-side token. Fetched at cold-start in Lambda runtime (LS-2790).                                                       |
| `VITE_ROLLBAR_ACCESS_TOKEN`        | Browser-side (post_client_item) token. Reused by the Expo app via `apps/app/app.config.js`.                                                                             |
| `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN` | React Native (post_client_item) token. Auto-aliased from `VITE_ROLLBAR_ACCESS_TOKEN` at config-load time. Set explicitly only to override.                              |
| `EXPO_PUBLIC_APP_VERSION`          | Optional release/version string for the native bundle. Auto-aliased from `APP_VERSION` when unset.                                                                      |
| `ROLLBAR_ENVIRONMENT`              | Override environment name                                                                                                                                               |
| `ROLLBAR_RELEASE`                  | Override release/version string                                                                                                                                         |
| `ROLLBAR_VERBOSE`                  | Set to `true` for verbose logging                                                                                                                                       |
| `ROLLBAR_DEDUPE_WINDOW_MS`         | Node only. Rolling window (ms) for collapsing identical items to one report; protects the `itemsPerMinute` budget from bursts (LS-8343). Default `60000`; `0` disables. |

## Server-side de-duplication (LS-8343)

The Node implementation collapses identical items (same severity + error
message) to a single Rollbar report per `dedupeWindowMs` (default 60s). Rollbar
counts every `captureError`/`captureWarning` call against a client-side
`itemsPerMinute` budget (25). A burst of one repeating error — e.g. thousands of
`CORS: rejected unrecognized WebSocket origin` warnings — would otherwise exhaust
that budget in seconds, causing Rollbar to drop _distinct_ real errors and emit
its "item per minute limit reached, ignoring errors until timeout" notice. The
suppressed occurrence count is attached to the next report of that fingerprint as
`suppressedSinceLastReport`, so burst volume stays visible. Tune or disable via
`ROLLBAR_DEDUPE_WINDOW_MS` (or the `dedupeWindowMs` config field) without a code
change. This is orthogonal to fixing a noisy call site at its source (e.g.
LS-8342 for the WebSocket origin allowlist) — it is the safety net that keeps any
future noise source from monopolizing the ingestion budget.

## How the mobile token gets wired (LS-4777)

`expo start` runs with cwd=`apps/app`, so by default Expo only reads `apps/app/.env*` — values set in the monorepo root `.env` (where every other Rollbar var lives) never reach the device. [`apps/app/app.config.js`](../../apps/app/app.config.js) closes that gap:

1. It loads the monorepo root `.env` via `dotenv` _before_ Metro starts, so `process.env` has the same view the web app and scripts see.
2. It aliases `VITE_ROLLBAR_ACCESS_TOKEN` → `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN` when the latter is unset, so one Rollbar client token serves both web and mobile. Items remain separable in the Rollbar dashboard via the `client.javascript.platform` / `platform` payload fields.
3. Metro then inlines `process.env.EXPO_PUBLIC_*` into the JS bundle as it always does.

Override paths (highest precedence wins):

- `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN` set in the shell that launched `expo start` (CI, EAS build runner).
- `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN=...` in `apps/app/.env.local` (gitignored).
- `VITE_ROLLBAR_ACCESS_TOKEN` from monorepo root `.env` (default — same value as the web app).

## Verifying mobile Rollbar end-to-end

The mobile chain is: `LOGGER.error(...)` → `RollbarOutputDestination` (registered by `initRollbar`) → `rollbar.captureError` → Rollbar dashboard. The shared `ErrorBoundary` calls `LOGGER.error` from `componentDidCatch`, so any thrown render error reaches Rollbar via the same path.

1. **Confirm the token is set.** From the monorepo root, `grep VITE_ROLLBAR_ACCESS_TOKEN .env` should show the post_client_item token. Nothing extra to provision — the same value covers web and mobile.
2. **Run a dev build:** `pnpm exec nx run app:start` and load the app on a simulator or device.
3. **Navigate to the smoke harness:** open `legacysports://dev-rollbar-test` (or use the in-app navigator to `/dev-rollbar-test`). The screen is dev-only and returns `null` in release builds.
4. **Fire each button** in turn:
   - **Fire LOGGER.error → Rollbar** verifies the `RollbarOutputDestination` registration.
   - **Throw uncaught (hits ErrorBoundary)** verifies the shared `ErrorBoundary` → `LOGGER.error` path.
5. **Confirm in Rollbar.** Open the Rollbar project dashboard and look for items titled `LS-4777 LOGGER.error smoke test` and `LS-4777 uncaught render error smoke test`. Note the URLs for the PR test plan.

If items do not appear, check the Metro logs for `Rollbar initialized for React Native environment` at startup. A `accessToken: 'NOT_SET'` line means `app.config.js` did not populate `process.env.EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN` — confirm `VITE_ROLLBAR_ACCESS_TOKEN` is present in the root `.env` and that nothing earlier (a shell export, an EAS secret) is setting `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN` to an empty string.

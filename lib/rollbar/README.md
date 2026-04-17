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

| Variable                           | Description                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ROLLBAR_ACCESS_TOKEN`             | Server-side (post_server_item) token. Used in local dev/CLI; Lambdas prefer `ROLLBAR_ACCESS_TOKEN_SECRET_NAME`.   |
| `ROLLBAR_ACCESS_TOKEN_SECRET_NAME` | AWS Secrets Manager secret name holding the server-side token. Fetched at cold-start in Lambda runtime (LS-2790). |
| `VITE_ROLLBAR_ACCESS_TOKEN`        | Browser-side (post_client_item) token                                                                             |
| `ROLLBAR_ENVIRONMENT`              | Override environment name                                                                                         |
| `ROLLBAR_RELEASE`                  | Override release/version string                                                                                   |
| `ROLLBAR_VERBOSE`                  | Set to `true` for verbose logging                                                                                 |

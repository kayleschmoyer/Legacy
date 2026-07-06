---
name: rollbar-monitoring
description: 'Rollbar error monitoring: how errors reach Rollbar, triaging with the rollbar_* MCP tools, and wiring sourcemap upload for a new Vite-built deployable. Load when: investigating production errors, adding error tracking to a new app/lambda, or debugging unsymbolicated stack traces.'
---

# Rollbar Error Monitoring

The repo's error monitoring is **Rollbar** (the earlier Sentry setup is gone — `lib/sentry` does not exist).

## How errors reach Rollbar

| Piece               | Path                                                              | Role                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client library      | `lib/rollbar/src/`                                                | `rollbar.init(config)` per platform: import from `@legacy-sports/rollbar` (Node/Lambda), `/web`, or `/native`                                                                                                                                                                                                                    |
| LOGGER auto-forward | `lib/rollbar/src/lib/RollbarOutputDestination.ts`                 | Registered by `rollbar.init`; forwards `LOGGER.error`/`LOGGER.fatal` to Rollbar. Do NOT also call `registerGlobalErrorCapture` — double-reporting was LS-1948                                                                                                                                                                    |
| Manual capture      | `captureError` / `captureWarning` from `@legacy-sports/rollbar/*` | For errors you handle but still want reported                                                                                                                                                                                                                                                                                    |
| Discord alerting    | `lambdas/rollbar-discord/src/`                                    | Forwards Rollbar occurrence webhooks to a Discord channel                                                                                                                                                                                                                                                                        |
| Jira ticketing      | Rollbar **native Jira integration** (SaaS config, not repo code)  | Auto-files a Jira ticket for items at/above the integration's min level (currently `error`), storing the link in `item.integrations_data.jira`. Create-only — it does **not** resolve items when the ticket reaches Done. Contract + gaps: [rollbar-jira-sync-contract.md](../../../../docs/ci-cd/rollbar-jira-sync-contract.md) |
| Deploy tracking     | `.github/actions/rollbar-deploy` (used by `deploy-web.yml`)       | Records deploys against `code_version`                                                                                                                                                                                                                                                                                           |

## Triaging errors (agents)

The triage workflow, the `rollbar_*` tool table, and the error-classification convention have one home: [prod-errors.md](../../debugging/references/prod-errors.md) — link there, do not restate. This file covers only the infra side: error-delivery wiring (above) and sourcemap upload (below). For Lambda-side context beyond the Rollbar payload, pair with [cloudwatch-logs.md](cloudwatch-logs.md).

## Wiring sourcemap upload for a new Vite deployable

Symbolicated production stack traces require uploading `.map` files at build time. The house plugin is `rollbarSourcemapPlugin` in `tools/vite-configs/rollbar-sourcemap-plugin.ts`.

1. In the project's `vite.config.mts`, enable hidden sourcemaps for deploy builds (`build.sourcemap: 'hidden'`) and add the plugin gated on the token being present:

   ```typescript
   import { rollbarSourcemapPlugin } from '../../tools/vite-configs';

   ...(isDeployBuild && process.env.ROLLBAR_ACCESS_TOKEN
     ? [
         rollbarSourcemapPlugin({
           accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
           version: commitSha,            // must equal the runtime code_version
           publicPath: 'https://legacy-fantasy.com', // web; lambdas use 'app://lambda-<name>'
           deleteFilesAfterUpload: true,  // web only — keep maps inside lambda packages
         }),
       ]
     : []),
   ```

   Working example: `apps/web/vite.config.mts` (search `rollbarSourcemapPlugin`).

2. In the deploy workflow, pass `ROLLBAR_ACCESS_TOKEN: ${{ secrets.ROLLBAR_ACCESS_TOKEN }}` to the build step — this is the **server-side write token**, distinct from the client bundle token. Working example: `.github/workflows/deploy-web.yml`.

3. Ensure the runtime `rollbar.init` uses the same `code_version` as the plugin's `version`, or Rollbar cannot match traces to maps.

## Provenance and maintenance

Written 2026-07-02 during the skills-audit overhaul, replacing the fossil `configure-sentry-sourcemaps.md`. Re-verify:

- Plugin options: read `RollbarSourcemapPluginOptions` in `tools/vite-configs/rollbar-sourcemap-plugin.ts`.
- Web wiring: `grep -n rollbarSourcemapPlugin apps/web/vite.config.mts`.
- Token in CI: `grep -n ROLLBAR_ACCESS_TOKEN .github/workflows/deploy-web.yml`.
- MCP tools: `tools/mcp/rollbar-server/src/` tool registrations.

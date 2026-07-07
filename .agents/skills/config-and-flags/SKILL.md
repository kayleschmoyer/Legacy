---
name: config-and-flags
description: 'The five configuration axes of this repo — client env registry, server secret indirection, DB credentials, Terraform variables, safety switches — plus where feature-flag and env-var truth lives. Load when: adding or consuming any env var, adding a client-side URL/key, debugging "config is undefined at runtime", touching .env files, wiring a secret into CI, or auditing feature flags.'
metadata:
  scope: '**'
---

# Skill: Config and Flags

Every configuration value in this repo travels one of five axes. Before adding or consuming a variable, identify its axis — each has a different delivery mechanism, failure mode, and home doc. The per-project consumption map and known dangling config live in [references/env-var-map.md](references/env-var-map.md).

**Survey precondition:** env vars are accessed in three styles — `process.env.X` (dot), `process.env['X']` (bracket — used by most lambdas, invisible to dot-only greps), and `getEnvVarRequired/Optional/WithDefault` from `lib/env-utilities`. Before concluding "this project has no config", run all three:

```bash
rg -n "process\.env\.[A-Z_]|process\.env\['|getEnvVar" <project>/src --glob '!*.spec.*'
```

## Axis A — client-side build-time vars (`VITE_*` / `EXPO_PUBLIC_*`)

**Home:** `lib/app-config/src/lib/registry.ts` (`CONFIG_KEYS`) — the single mapping of logical key → `VITE_*` (web) / `EXPO_PUBLIC_*` (mobile) / bare (node) names, with a `clientSafe` flag per key. Adapters read the registry statically: `config.web.ts` (via `import.meta.env`), `config.native.ts` (static `process.env.EXPO_PUBLIC_*` member expressions with `Constants.expoConfig.extra` fallback for old binaries), `config.node.ts`. `apps/web` has **zero** direct `process.env` reads — everything goes through the registry; keep it that way.

Preconditions for a **new client key**:

1. Register it in `CONFIG_KEYS` with `clientSafe: false` until a reviewer marks it safe (registry header rule; `registry.spec.ts` and the client-safe guard enforce shape).
2. Mobile alias: if the key needs a native counterpart, add it to `CONFIG_KEY_ALIASES` in `lib/app-config/plugins/config-aliases.js` — the `with-expo-public-env` prebuild plugin (registered in `apps/app/app.json`) regenerates the gitignored `apps/app/.env` from root `.env` + aliases on every prebuild. `app.config.js` mirrors only `APP_VERSION` (LS-7558/LS-7561).
3. CI delivery: add the var to the build env of `deploy-web.yml` (and `build-android-app.yml` job env for mobile) from a **platform-neutral** secret name — e.g. secret `GIPHY_API_KEY` becomes both `VITE_GIPHY_API_KEY` and `EXPO_PUBLIC_GIPHY_API_KEY`. One secret, both platforms, no drift.

**The inlining trap (LS-8011) — applies to every new URL-ish client var:** `VITE_`/`EXPO_PUBLIC_` values are inlined at build time. An _empty_ value gets constant-folded, and esbuild dead-code-eliminates every branch behind it — in E2E builds this silently deleted the WebSocket guard and OAuth exchange. If E2E tests must exercise code gated on your var, replicate the runtime-override pattern in `apps/web/src/config/environment.ts` (`getEnvironmentConfig`): a `window.__e2e<Name>` global read only when `navigator.webdriver === true`, injected by Playwright `addInitScript`. Existing examples: `__e2eWsUrl`, `__e2eJiraProxyUrl`, `__e2eOauthProxyUrl`.

**Prod-misconfig guard:** `getProductionConfigErrors()` in the same file flags localhost/placeholder fallbacks in non-dev builds (the LS-4964 MITM lesson: never add a localhost fallback to a production code path — surface the missing config instead).

Known registry quirks (do not "fix" blindly): `environmentName`/`VITE_ENVIRONMENT_NAME` is a dead key — replaced by `import.meta.env.MODE` in LS-5709; `VITE_VERSION` is set by `deploy-web.yml` and read by `lib/utils` `version.ts` but bypasses the registry (use `appVersion`/`commitSha`/`buildDate` keys for new code).

Feature flags (GrowthBook) ride this axis via the `growthbookClientKey` registry key. Flag inventory, fallback semantics, and the key-delivery chain: [docs/feature-flags.md](../../../docs/feature-flags.md) — the single home; don't restate flag facts elsewhere.

## Axis B — server-side secrets (`*_SECRET_NAME` indirection)

Lambdas never receive secret values in env vars. The convention: env var `<NAME>_SECRET_NAME` holds an AWS Secrets Manager **secret name**, resolved at runtime via the SDK; a plain `<NAME>` var exists as a local/test override. Canonical example: `lambdas/stripe-webhook/src/index.ts` (`STRIPE_SECRET_KEY` vs `STRIPE_SECRET_KEY_SECRET_NAME`); same pattern in `apple-iap` (`APPLE_BUNDLE_ID[_SECRET_NAME]`), `jira-proxy`, `github-webhook`, `rollbar-discord`, `oauth-proxy` (`*_KEY_PATH` variants).

Adding one end-to-end (Terraform variable → Secrets Manager → IAM → lambda env → GitHub secret → CI `TF_VAR_`) is an 11-location checklist owned by the terraform skill: [add-secret-or-env-var.md](../terraform/references/add-secret-or-env-var.md) (start with `make scan-secret VAR=NAME`). For handling the secret **value** in tool calls, see [secrets-handling](../secrets-handling/SKILL.md). Never write real values into any file this skill mentions.

## Axis C — database credentials

Home for connection mechanics: [database](../database/SKILL.md). Config facts only:

- Unified system: `DB_SECRET_NAME` + `USE_LOCAL_CREDENTIALS` (enum: `lib/db-client/src/types/EnvironmentVariable.ts` — this is where the real logic lives). Legacy aliases still supported: `DB_CREDS_PATH`, `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_CERT_PATH`.
- Constraint (same enum file): `DB_SSL_SELF_SIGNED` must NOT be set together with `USE_LOCAL_CREDENTIALS=true`.
- **Trap:** `lambdas/db/src/Environment.ts` defines a stale near-duplicate `USE_LOCAL_CREDS` (only ever _logged_, in `lambdas/db/src/dev.ts`). The variable that drives behavior is `USE_LOCAL_CREDENTIALS`. Setting the short one does nothing.
- Trap (LS-3166/LS-3168): the Lambda cert layer at `/opt/certs/us-east-1-bundle.pem` was removed; `DB_CERT_PATH` is intentionally absent from lambda env blocks — pointing it at the old path references a nonexistent file.
- Test DBs: `TEST_DATABASE_URL` (falls back to `DATABASE_URL`) for `lambdas/db` DB specs; `DATABASE_URL` for Drizzle scripts.

## Axis D — Terraform variables and CI `TF_VAR_` flow

Homes: `terraform/main/variables.tf` (plain config: environment, instance sizes, throttles, `mlb_data_provider` licensing gate) and `terraform/main/secrets.tf` (secret input variables). CI passes secrets as `TF_VAR_*` env in `.github/workflows/lambda-terraform-apply.yml`. The runners state has its own `terraform/runners/variables.tf`. The how-to for adding either kind is the terraform checklist linked in Axis B — that reference is the single home; this skill only names the axis.

## Axis E — safety switches

| Var                       | Effect                                                                                                                                      | Where                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `LEGACY_SPORTS_ENV`       | `production` → destructive CLI commands refuse to run (`assertEnvNotProduction`)                                                            | `apps/cli/src/commands/resetDatabase.ts`                       |
| `EXPO_PUBLIC_BYPASS_AUTH` | `true` → mobile auth returns fake `LOCAL_USER` (id −1); **throws** in production builds; intentionally never set in `build-android-app.yml` | `apps/app/src/common/auth/AuthHooks.ts`                        |
| `IS_LOCAL`                | `true` → oauth-proxy relaxes cookie/state security for local HTTP; `.env.docker` sets it for compose only                                   | `lambdas/oauth-proxy/src/util/jwt-cookie.ts`, `oauth-state.ts` |

Before adding a new destructive command or auth shortcut, gate it on one of these existing switches rather than inventing a new var.

## Env-file layering (local dev)

Precedence, later wins within each consumer:

1. Root `.env` — real values, gitignored, populated by `pnpm run sync-env` (`scripts/sync-env.ps1`, PowerShell/Windows).
2. `.env.docker` — committed dev-only overrides; `docker-compose.yml` loads `.env` then `.env.docker`.
3. `apps/app/.env.local` then root `../../.env` — loaded by `app.config.js` with `override: false`, so shell/CI/EAS always wins.
4. `apps/app/.env` — machine-generated by the prebuild plugin (Axis A); never edit.

`.env.example` is the annotated template — when you add any consumed var, add a placeholder line there in the same PR (that file's gap was a top-10 audit finding).

## Related skills

- [terraform](../terraform/SKILL.md) — add-secret checklist (the plumbing home)
- [secrets-handling](../secrets-handling/SKILL.md) — never expose values in tool calls
- [database](../database/SKILL.md) — connection and migration mechanics
- [add-entitlement](../add-entitlement/SKILL.md) — premium gating is a separate axis (code-owned entitlements map → Stripe), not env config
- [testing](../testing/SKILL.md) — seeding feature flags and E2E env

## Provenance and maintenance

Created 2026-07-02 from the repo-wide skills audit (`scratch/skills-audit/found-config-flags.json` + synthesis), same PR that wired `GROWTHBOOK_CLIENT_KEY` into CI builds. Re-verify volatile facts:

- Registry keys: `rg -n "clientSafe" lib/app-config/src/lib/registry.ts`
- Mobile alias table: `cat lib/app-config/plugins/config-aliases.js`
- CI client-var delivery: `rg -n "VITE_|EXPO_PUBLIC_" .github/workflows/deploy-web.yml .github/workflows/build-android-app.yml`
- `_SECRET_NAME` pattern: `rg -n "_SECRET_NAME" lambdas/*/src --glob '!*.spec.*'`
- DB enum split: `rg -n "USE_LOCAL_CRED" lib/db-client lambdas/db`
- Safety switches: `rg -n "LEGACY_SPORTS_ENV|BYPASS_AUTH|IS_LOCAL" apps lambdas --glob '!*.spec.*'`

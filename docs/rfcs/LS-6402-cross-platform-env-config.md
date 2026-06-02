# Unified cross-platform environment configuration layer (LS-6402)

## Status

Accepted

## Problem

Environment configuration is read three incompatible ways across the monorepo, and the boundaries between them leak in ways that cause production bugs.

**1. Naming is fragmented across platforms.** The same logical value exists under different names per platform:

| Logical value  | Web (`apps/web`)             | Mobile (`apps/app`)                 | Node / lambdas         |
| -------------- | ---------------------------- | ----------------------------------- | ---------------------- |
| Stats API URL  | `VITE_STATS_API_URL`         | `EXPO_PUBLIC_STATS_API_URL`         | (n/a)                  |
| Websocket URL  | `VITE_WEBSOCKET_URL`         | `EXPO_PUBLIC_WEBSOCKET_URL`         | (n/a)                  |
| Rollbar token  | `VITE_ROLLBAR_ACCESS_TOKEN`  | `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN`  | `ROLLBAR_ACCESS_TOKEN` |
| Giphy key      | `VITE_GIPHY_API_KEY`         | `EXPO_PUBLIC_GIPHY_API_KEY`         | (n/a)                  |
| GrowthBook key | `VITE_GROWTHBOOK_CLIENT_KEY` | `EXPO_PUBLIC_GROWTHBOOK_CLIENT_KEY` | (n/a)                  |

Today these are reconciled by ad-hoc, per-call aliasing (`apps/app/app.config.js` mirrors `VITE_*` → `EXPO_PUBLIC_*`; the recently-added `apps/app/expo-public-env.js` centralizes a handful). There is no single registry of "what is this value called on each platform."

**2. Static vs. dynamic access is a silent correctness trap.** Bundlers only inline _static_ member reads:

- Web: Vite statically replaces `import.meta.env.VITE_X` (and configured `process.env.VITE_X` `define` entries) at build time.
- Mobile: `babel-preset-expo` inlines static `process.env.EXPO_PUBLIC_X` reads — but only if `@expo/env` loaded the value.

A _dynamic_ read — `process.env[name]`, which is exactly what `@legacy-sports/env-utilities` (`getEnvVarOptional` / `getEnvVarRequired`) does — can never be inlined and resolves to `undefined` in any web/mobile release bundle. This is the precise failure class behind:

- **LS-6399** — OAuth proxy / Google client id / GraphQL host read dynamically → `undefined` in the Android release bundle → fell back to `http://localhost:5001/oauth` → "CLEARTEXT communication to localhost not permitted" crash on Google sign-in.
- **LS-6402 (original bug)** — `EXPO_PUBLIC_STATS_API_URL`, `EXPO_PUBLIC_WEBSOCKET_URL`, giphy, and rollbar all broken or silently degraded in release for the same reason.

The trap is invisible at dev time (`expo start` / `vite dev` populate `process.env`) and only manifests in release builds.

**3. Source of truth differs per build path, with stacked workarounds.** Values flow from: monorepo root `.env`, per-app `.env`, Vite `define`, Expo `extra` / `Constants.expoConfig.extra`, and Lambda runtime env. Each is wired separately, and the gaps have accreted workarounds: dotenv-from-root in `app.config.js` (LS-4777), `extra` routing for dynamic reads (LS-6399), and prebuild `apps/app/.env` generation (the closed PR #4684). Each workaround fixes one leak; none unifies the model.

The net effect: adding or reading a config value requires platform-specific knowledge of _which name_, _which access pattern_, and _which source_ — and getting it wrong fails silently in release only.

## Goals

- **Single read API.** Every consumer reads logical keys through one typed module — e.g. `config.statsApiUrl` / `getConfig().statsApiUrl` — never raw `process.env`, `import.meta.env`, or `Constants` directly.
- **Static-by-construction.** The module guarantees that every underlying read is a static, inlinable expression on web and mobile, so the dynamic-read inlining trap is structurally impossible (not merely avoided by convention).
- **One key registry.** Each logical key's per-platform name and required/optional status is declared in exactly one place; aliasing lives there, not at call sites.
- **Fail loud, never silent.** A missing _required_ value throws at startup (or surfaces a clear error), instead of falling back to an unreachable default (the localhost-cleartext failure mode).
- **Typed + discoverable.** Consumers get autocomplete and type-checking on config keys; adding a key is a single, reviewable change.
- **Subsumes existing workarounds.** The Expo prebuild `.env` generation, the `VITE_*`↔`EXPO_PUBLIC_*` aliasing, and the `extra` routing all become implementation details of this layer (or are removed).

## Non-goals

- **Secret provisioning / rotation / storage.** This RFC is about _reading_ config in app code. How secrets get into `.env` / EAS / Lambda env / Secrets Manager is unchanged (see `add-secret-or-env-var` skill and the MCP machine-credential runbook).
- **Server-side runtime config that legitimately must stay dynamic** (e.g. Lambda values resolved from Secrets Manager at cold start). The layer must _accommodate_ runtime resolution in Node, not force inlining there.
- **Changing the underlying `.env` files or variable values.** Only the read path and naming registry change.
- **A new config delivery mechanism** (remote config service, etc.). Out of scope.

## Proposal

Introduce a shared package — **`lib/app-config`** (name TBD; could extend `lib/env-utilities`) — that exposes a typed config object built from a **central key registry** plus **per-platform source adapters**. The build/bundler picks the right adapter via package `exports` conditions (the same `.native` / browser / node resolution the repo already uses for `@legacy-sports/rollbar`).

### Key registry

A single declarative table maps each logical key to its per-platform variable name, type, whether it is required, and **whether it is safe to expose in a client bundle**:

```ts
// lib/app-config/src/registry.ts  (illustrative)
export const CONFIG_KEYS = {
  // clientSafe: true  → value may be inlined into web/mobile bundles (publicly visible).
  // clientSafe: false → server-only secret; web/mobile names are forbidden, node-only.
  statsApiUrl: {
    clientSafe: true,
    web: 'VITE_STATS_API_URL',
    mobile: 'EXPO_PUBLIC_STATS_API_URL',
    required: false,
  },
  websocketUrl: {
    clientSafe: true,
    web: 'VITE_WEBSOCKET_URL',
    mobile: 'EXPO_PUBLIC_WEBSOCKET_URL',
    required: false,
  },
  rollbarToken: {
    clientSafe: true,
    web: 'VITE_ROLLBAR_ACCESS_TOKEN',
    mobile: 'EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN',
    node: 'ROLLBAR_ACCESS_TOKEN',
    required: false,
  }, // post_client_item token — public by design
  giphyApiKey: {
    clientSafe: true,
    web: 'VITE_GIPHY_API_KEY',
    mobile: 'EXPO_PUBLIC_GIPHY_API_KEY',
    required: false,
  },
  // Example server-only secret (deferred to the Node slice): no web/mobile names permitted.
  // dbPassword: { clientSafe: false, node: 'DB_PASSWORD', required: true },
  // ...one row per logical value
} as const;
```

This registry is the single source of truth that replaces all scattered aliasing.

**Client-safe vs. server-only is enforced, not advisory (security).** The `clientSafe` flag is the explicit guard against accidentally inlining a secret into a public bundle — the dominant risk of any build-time-injected config. A registry-shape lint/type check (and a unit test) rejects any key that is `clientSafe: false` yet declares a `web` or `mobile` name, and the web/mobile adapters only ever read keys whose `clientSafe` is `true`. Because `EXPO_PUBLIC_*` / `VITE_*` values are world-readable once shipped, the default for a new key should be `clientSafe: false` until a reviewer affirmatively marks it client-safe. v1 seeds only `clientSafe: true` URLs/keys; server-only secrets enter via the Node slice with `clientSafe: false`.

### Per-platform adapters (static reads only)

Each adapter resolves the registry into a concrete config object using only statically-analyzable reads, so the bundler inlines them:

- **Web (`*.web.ts` / browser condition):** read `import.meta.env.VITE_X` (or the project's `define`d `process.env.VITE_X`) via a handwritten, fully-static accessor. No dynamic indexing.
- **Mobile (`*.native.ts`):** read static `process.env.EXPO_PUBLIC_X`, falling back to `Constants.expoConfig.extra.X` for values that must remain dynamic (the LS-6399 channel). The closed PR #4684's prebuild `.env` generation becomes the mechanism that makes the static reads resolve in release, owned by this package.
- **Node / lambdas (`*.node.ts`):** read `process.env.X` at runtime (dynamic is correct here — no bundler inlining), with optional async resolution for Secrets-Manager-backed values.

Because each platform key is a _literal_ in the handwritten static accessors (see the Decisions section), the "static read" guarantee is enforced by the package's own code plus the lint rule, not by every consumer remembering it.

### Validation + fail-loud

At module init, validate that every `required` key for the current platform resolved to a non-empty value; throw a single aggregated error listing missing keys. Optional keys return `undefined` (typed as such) so call sites must handle absence explicitly — no silent unreachable-default fallbacks.

### Consumption

```ts
import { config } from '@legacy-sports/app-config';
axiosInstance.post(config.statsApiUrl ?? devStatsFallback(), { ... });
```

The existing `resolveStatsApiUrl` (`__DEV__`-gated fail-loud) behavior is generalized into the layer.

### Lint enforcement

Add a `lint-review-patterns` / ESLint rule forbidding direct `process.env.VITE_*` / `process.env.EXPO_PUBLIC_*` / `import.meta.env` reads outside `lib/app-config`, so new code cannot reintroduce the trap. The same rule (or a registry-shape unit test) also enforces the **client-safe guard**: a key with `clientSafe: false` may not declare a `web` or `mobile` name, preventing a server-only secret from ever reaching a client adapter.

### Migration (epic → child tickets)

After this RFC is accepted, create independently-shippable child tickets under LS-6402:

1. **`lib/app-config` package** — registry, adapters, validation, tests. (Foundational; blocks the rest.)
2. **Mobile migration** — fold PR #4684's plugin + alias module + `resolveStatsApiUrl` into the package; migrate `apps/app` consumers; remove `app.config.js` ad-hoc aliasing.
3. **Web migration** — migrate `apps/web` + `lib/shared-components` consumers off raw `VITE_*` reads.
4. **Node/lambdas migration** — migrate `lib/env-utilities` consumers; keep runtime resolution.
5. **Lint rule + cleanup** — enforce the boundary; delete dead aliasing/workarounds.

Each child is its own worktree/PR; this ticket is the umbrella + RFC owner.

## Alternatives Considered

### Alternative A: Keep per-platform fixes, expand the alias module only

Continue the current trajectory: a shared alias table (`expo-public-env.js`) plus `extra` routing plus prebuild `.env` generation, extended as new gaps appear.

**Why rejected**: it does not eliminate the dynamic-read trap (consumers still read raw `process.env`), keeps three naming worlds, and leaves correctness dependent on every author knowing the static-vs-dynamic rule. It is the status quo that produced LS-6399 and LS-6402.

### Alternative B: Force a single variable prefix everywhere (e.g. only `EXPO_PUBLIC_*` or only bare names)

Standardize one name per value across all platforms and drop aliasing.

**Why rejected**: the prefixes are not cosmetic — `VITE_` and `EXPO_PUBLIC_` are the literal tokens each bundler scans for inlining. A single prefix cannot satisfy both Vite and Expo, and bare names are never inlined on the client. Naming must stay per-platform; the registry is what hides that.

### Alternative C: Runtime-only config (fetch config at app start from an endpoint)

Serve config from a `/config` endpoint instead of build-time injection.

**Why rejected**: adds a network round-trip on cold start, a new failure mode (offline / endpoint down), and does not fit values needed before the network layer initializes (the GraphQL host, the OAuth proxy). Larger blast radius than the problem warrants; revisit only if config must change without a redeploy.

## Risks

| Risk                                                                                     | Likelihood | Impact | Mitigation                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Large migration touches many files; review/merge churn                                   | High       | Med    | Slice per platform/package into independent child PRs; land the package first, migrate incrementally behind it.                                                                                                                |
| Bundler-condition resolution (`.web`/`.native`/`.node`) misconfig                        | Med        | High   | Reuse the exact `exports`-conditions pattern already proven by `@legacy-sports/rollbar`; add per-platform smoke tests.                                                                                                         |
| A handwritten "static" accessor accidentally becomes dynamic and silently breaks release | Med        | High   | Keep accessors handwritten with literal reads (per the Decisions section); the lint rule rejects dynamic `process.env[...]`/`import.meta.env[...]` indexing, and a release-bundle grep/test asserts a known value was inlined. |
| Lambda values needing async Secrets-Manager resolution don't fit a sync API              | Med        | Med    | Node adapter supports an async resolution path (mirrors existing `rollbar.node` `accessTokenSecretName` flow).                                                                                                                 |
| Real release-APK verification not reproducible in CI                                     | High       | Low    | Keep manual release-APK QA as the mobile child's acceptance gate; rely on inlining-assertion tests in CI.                                                                                                                      |

## Test Plan

- **Unit (per adapter):** registry resolution, required-key validation throws with aggregated missing list, optional keys return `undefined`, alias precedence (explicit platform var wins over fallback).
- **Static-inlining assertion:** a build-output test (web + mobile) greps the release bundle to confirm a known config value was inlined (not left as a dynamic lookup) — the regression guard for the trap.
- **Bundler-condition tests:** importing `@legacy-sports/app-config` resolves the correct adapter under jest (node), Vite (web), and Metro/babel (native).
- **Lint rule test:** the new ESLint rule flags a direct `process.env.EXPO_PUBLIC_*` read outside the package.
- **Manual (mobile child):** release APK reaches real stats / websocket / Rollbar URLs (carried over from the original LS-6402 verification).
- `make pc` green on every child PR.

## Rollout

1. Land `lib/app-config` with no consumers migrated (additive, zero risk).
2. Migrate platform-by-platform behind it (mobile → web → node), one child PR each; old reads keep working until each file is migrated.
3. After all consumers migrate, enable the lint rule (warn → error) and delete the legacy aliasing / prebuild workarounds.
4. **Rollback:** because migration is incremental and the package is additive, any child PR can be reverted independently without affecting the others; the legacy reads remain valid until the final cleanup step.

## Open Questions

_Resolved at acceptance (LS-6402); recorded here as the decisions the child tickets implement._

- **Package home — RESOLVED: new `lib/app-config`.** A dedicated package keeps the browser/native adapter code out of Node lambda consumers via airtight `exports` conditions; extending `lib/env-utilities` (a Node-leaning dependency of many lambdas) risks leaking client adapters into server bundles. `lib/env-utilities` stays as the low-level `process.env` accessor the Node adapter builds on.
- **Generated vs. handwritten accessors — RESOLVED: handwritten per-platform accessors, guarded by the lint rule + a release-bundle inlining-assertion test.** Avoids adding a codegen build step; staticness is enforced mechanically rather than by generation. Revisit codegen only if registry/accessor drift becomes a recurring problem.
- **Web read form — RESOLVED: `import.meta.env.VITE_*`.** Vite's first-class, always-replaced mechanism; the web adapter centralizes it so the choice is invisible to consumers. (The package-foundation child must confirm the current Vite config and migrate any `define`d `process.env.VITE_*` shim form.)
- **v1 key scope — RESOLVED: client-bundled config first** (the values that actually hit the inlining trap: stats/websocket URLs, Rollbar token, Giphy/GrowthBook keys, OAuth proxy, GraphQL host, Google client id, app base url — web + mobile). Bare-name Node-only lambda config is migrated in a later slice once the pattern is proven.

## Decisions

1. Package: **`lib/app-config`** (new), built on `lib/env-utilities` for the Node runtime read.
2. Accessors: **handwritten**, enforced by lint + inlining-assertion test.
3. Web: **`import.meta.env.VITE_*`**.
4. v1 scope: **client-bundled keys** (web + mobile); Node-only config deferred.
5. Registry carries an explicit **`clientSafe`** flag (default `false`); `clientSafe: false` keys may not declare web/mobile names, enforced by lint + a registry-shape test, to prevent accidental secret inlining.

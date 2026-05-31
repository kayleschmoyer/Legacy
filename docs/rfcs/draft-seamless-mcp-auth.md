# Make MCP server authentication seamless across local, Copilot, and Claude Code web

|             |                                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**  | Draft                                                                                                                                                                                                                                                                               |
| **Ticket**  | [LS-5088](https://bkrupa.atlassian.net/browse/LS-5088)                                                                                                                                                                                                                              |
| **Author**  | (drafted with Claude Code)                                                                                                                                                                                                                                                          |
| **Date**    | 2026-05-31                                                                                                                                                                                                                                                                          |
| **Affects** | `.mcp.json`, `scripts/mcp-auth.mjs`, `tools/mcp/{github,jira,ci}-server/src/mcp-bearer-auth.ts`, `tools/mcp/{github,jira,ci}-server/src/lambda.ts`, `terraform/main/lambda-mcp-api-gateway.tf`, `terraform/main/lambda-mcp-{github,jira,ci}.tf`, SessionStart MCP health-check hook |

## Status

Draft

## TL;DR

The three hosted MCP servers (`legacy-sports-github`, `legacy-sports-jira`, `legacy-sports-ci`) authenticate by freezing a **short-lived (8 h) Cognito ID token** into a **static `Authorization: Bearer` header** that Claude Code resolves **once at connection spawn** and never re-reads. This produces three distinct, recurring failures:

1. **Mid-session death (local):** any session that outlives the 8 h token 401s on every MCP call, unrecoverable without a full session restart.
2. **No headless/SSO path:** the credential is minted by an interactive browser flow; cloud agents that lack an interactive login or AWS SSO can't obtain one.
3. **Cannot run in Claude Code on the web at all:** CC web ignores project `.mcp.json` and its connector UI has **no bearer-token field** — only OAuth — so the current scheme is non-configurable there.

This RFC proposes a **two-track design** that makes all three seamless: **(Track A)** move the dynamic, expiring part of auth out of the frozen header — a process-free `headersHelper` mints a **short-lived** token per connect from a **locally-held** machine credential, so the durable secret never transits the wire — fixing local + Copilot with zero new resident processes; and **(Track B)** implement the MCP OAuth Authorization spec on the same Lambdas so they can be registered as Claude Code web connectors. We explicitly catalog the **upstream Claude Code gaps** (no mid-session refresh, no `client_credentials` grant) that bound what "seamless" can mean today, and design Track A to be _immune_ to all of them.

## Problem

### How auth works today

| Layer                | Implementation                                                                                                                                                                                                                                                 | Reference                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Token minting        | OAuth **authorization-code + PKCE** via the Cognito hosted UI; redirect to `http://localhost:57329`. Human sets a password on first run.                                                                                                                       | `scripts/mcp-auth.mjs`                                                                                              |
| Token storage        | Writes `MCP_AUTH_TOKEN` (8 h ID token), `MCP_AUTH_REFRESH_TOKEN` (30 d), `MCP_AUTH_EXPIRES_AT`, and the three `MCP_*_URL`s to `.env.local`; mirrors into `~/.claude/settings.json#/env`, `.claude/settings.local.json#/env`, and `~/.claude.json#/mcpServers`. | `scripts/mcp-auth.mjs`                                                                                              |
| Transport config     | `.mcp.json` defines each server as `{ url: "${MCP_*_URL}", headers: { Authorization: "Bearer ${MCP_AUTH_TOKEN}" } }`.                                                                                                                                          | `.mcp.json`                                                                                                         |
| Server validation    | API Gateway HTTP API has **no authorizer**; the Lambda validates the JWT itself via `jose.jwtVerify` against Cognito JWKS, checking `issuer = MCP_COGNITO_ISSUER` and `audience = MCP_COGNITO_AUDIENCE`.                                                       | `tools/mcp/{github,jira,ci}-server/src/mcp-bearer-auth.ts` (3 duplicate copies, ~203 lines each)                    |
| Cloud (Copilot) path | A **second** auth path: Lambda Function URLs with `authorization_type = AWS_IAM`, invoked SigV4 by the GitHub Actions OIDC role carrying the `mcp_invoke` policy. Bearer check is bypassed when the request domain matches `*.lambda-url.*.on.aws`.            | `terraform/main/lambda-mcp-shared.tf`, `…-{github,jira,ci}.tf`; `isFunctionUrlInvocation()` in `mcp-bearer-auth.ts` |
| Cognito config       | Public client (`generate_secret = false`), `allowed_oauth_flows = ["code"]`, `allowed_oauth_scopes = ["openid"]`. `access_token_validity = 8h`, `id_token_validity = 8h`, `refresh_token_validity = 30d`. Admin-invite only.                                   | `terraform/main/lambda-mcp-api-gateway.tf`                                                                          |
| Expiry detection     | SessionStart MCP health-check hook decodes the token `exp` and prints `[MCP WARNING] MCP_AUTH_TOKEN has expired` — **warn-only**, no refresh, no remediation.                                                                                                  | SessionStart hook (emits the banner seen at session start)                                                          |

### The three concrete failures

**F1 — Mid-session token death (local).** Claude Code resolves `${MCP_AUTH_TOKEN}` **once, at connection spawn**, and bakes the literal string into the transport's header. When the 8 h token expires mid-session, every `jira/github/ci` call returns a JSON-RPC auth error and **nothing the agent or any hook writes to `.env.local` reaches the already-spawned transport.** Recovery requires the user to run `node scripts/mcp-auth.mjs` _and restart the session_. This is the failure the session-start banner is warning about right now.

**F2 — No headless / non-SSO credential path.** The only way to mint `MCP_AUTH_TOKEN` is the interactive hosted-UI authorization-code flow. There is no machine-to-machine grant. Copilot side-steps this with an entirely separate SigV4/OIDC path — meaning we maintain **two auth schemes for the same three servers**, and any environment with neither an interactive browser nor AWS SSO (e.g. a fresh worktree whose AWS SSO has lapsed; the warning at the top of this session) is locked out.

**F3 — Claude Code on the web is structurally excluded.** Verified behavior: CC web does **not** read project `.mcp.json`, and its custom-connector UI exposes **only OAuth client id/secret — there is no bearer/static-token field** ([`claude-ai-mcp#112`](https://github.com/anthropics/claude-ai-mcp/issues/112)). So the current bearer scheme cannot even be expressed in CC web; it is excluded by construction, independent of any token-lifetime issue.

### Why this is hard to "just fix"

Upstream Claude Code client limitations bound the solution space (confirmed against docs + tracked issues):

- **No automatic mid-session OAuth refresh** ([`claude-code#58607`](https://github.com/anthropics/claude-code/issues/58607)). Even a spec-perfect OAuth server with a refresh token does **not** auto-refresh mid-session today — an expired access token still fails all calls until the user re-auths via `/mcp`. So "switch to OAuth" alone does **not** fix F1.
- **No `client_credentials` grant** ([`claude-code#26675`](https://github.com/anthropics/claude-code/issues/26675)). Claude Code only drives the interactive authorization-code flow for remote MCP servers. So we cannot lean on the client to do headless machine auth (F2).
- **Static `${ENV}` headers resolve once at spawn**, never per request; no hook (SessionStart, PreToolUse, …) can mutate an already-spawned transport's header; there is no per-request MCP hook. (Windows has an additional substitution bug, [`claude-code#6204`](https://github.com/anthropics/claude-code/issues/6204).)
- **`headersHelper` exists** — a config-declared command Claude Code invokes **at every (re)connect** (not per request) to generate fresh headers, receiving `CLAUDE_CODE_MCP_SERVER_NAME` / `CLAUDE_CODE_MCP_SERVER_URL`. It is the one client-side refresh primitive available, but it is per-connection, not per-request.

The unifying insight: **the bug only exists because we put a short-lived value in a slot that is resolved once.** The fix is to ensure the value the client holds is _long-lived and stable_, and to put the expiring/refreshing logic where we already run code (the Lambda) or in a per-connect minting command — not in a frozen header.

## Goals

- **G1 — No mid-session death, any session length.** A local session running 24 h+ continues to reach all three MCP servers without restart or manual re-auth.
- **G2 — One credential model for local + Copilot.** Retire the dual bearer-vs-SigV4 split where feasible; a single, rotatable, non-interactive credential works in both.
- **G3 — Headless-capable.** Authentication requires no interactive browser and no AWS SSO session at request time.
- **G4 — Claude Code web reachable.** The three servers are usable from a CC web session via a supported registration path.
- **G5 — No new resident processes or user-managed daemons.** The fix must not add per-session memory cost (ruling out per-session stdio shims) or a long-lived proxy the user must start/keep alive.
- **G6 — Rotatable, least-privilege, revocable credentials.** Any long-lived secret has a defined rotation story and minimal scope.
- **G7 — Deduplicated, well-tested auth code.** Collapse the three copied `mcp-bearer-auth.ts` files into one shared module with unit tests.

## Non-goals

- **Replacing Cognito.** We keep the existing Cognito user pool and JWKS validation; we change _grant types_ and _where exchange happens_, not the identity provider.
- **Per-developer attribution inside MCP tokens.** Track A trades user identity for a machine identity (see Risks/Open Questions). Auditing individual developers via the MCP token is out of scope; CloudTrail/Lambda logs remain.
- **Fixing the upstream Claude Code gaps ourselves.** We design _around_ `#58607` / `#26675`; we do not patch the client. We track them as dependencies.
- **Changing the local stdio MCP servers** (`make`, `nx`, `db`, `aws`, `browser`, `dev-process`, `worktree`, `ci-local`). They don't use this auth path.
- **Migrating Jira/GitHub credential storage.** Those stay in Secrets Manager, read server-side.

## Proposal

A **two-track** design. Track A is the near-term win covering local + Copilot (G1–G3, G5–G7). Track B unlocks Claude Code web (G4) and is gated on a probe + an upstream limitation.

### Guiding principle

> Never place a short-lived value in a slot the client resolves once. Keep the client's credential **long-lived and stable**; move all expiry/refresh **server-side** (where we already run code) or into a **per-connect minting command**.

### Track A — Local minting + server-side validation (local + Copilot)

**Chosen design (OQ-2):** the client mints a **short-lived** token locally per connect and transmits only that; the **long-lived machine secret never leaves the machine**, and the Lambda **only validates** — it does not hold the secret or perform any exchange. (The rejected server-side-exchange alternative, where the Lambda would perform the exchange, is documented in step 5 and in Alternatives.)

1. **Provision a Cognito machine grant.** Add a Cognito **resource server** exposing **per-server scopes** `mcp/jira`, `mcp/github`, `mcp/ci` (OQ-4, least privilege) and a **confidential app client** (`generate_secret = true`, `allowed_oauth_flows = ["client_credentials"]`) in `lambda-mcp-api-gateway.tf`. This is a _separate_ client from the existing public `mcp_cli` (which stays for any interactive use). Each Lambda accepts **only its own scope**. Publish the client id/secret to SSM/Secrets Manager.

2. **Client mints locally via `headersHelper`.** `.mcp.json` declares a `headersHelper` command (e.g. `node scripts/mcp-mint-token.mjs`) that Claude Code runs at every (re)connect. It performs the `client_credentials` exchange **locally** against the Cognito token endpoint, requests **only the scope(s) the context needs**, and emits `Authorization: Bearer <short-lived access token>`. The **long-lived machine secret stays on the machine** (OS keychain / `.env.local` locally; environment secret on Copilot — **same shape both places**, G2) and **never transits the wire**. The command is **process-free** — it runs and exits, so no daemon and no per-session resident memory (G5).

3. **Lambda validates only — no exchange, no cache, no secret.** The shared auth module verifies the presented short token: `jwtVerify` on `issuer` + signature + `exp`, and that the token carries **this server's** per-server scope (e.g. the Jira Lambda requires `mcp/jira`). The Lambda holds no credential and performs no `client_credentials` exchange — that work lives entirely in the client-side minting command. This is strictly _simpler_ than today's validation plus the rejected server-side-exchange variant.

4. **Migration dual-accept.** During cutover, `mcp-bearer-auth.ts` accepts **two** token shapes behind a flag: the legacy user ID token (`aud = mcp_cli` id) _and_ the new machine access token (carries the server's `mcp/*` scope, `client_id = machine client`). Lets us flip per environment with zero downtime, then drop the legacy path.

5. **Why not server-side exchange (the rejected alternative).** The other way to satisfy the guiding principle is to put the long-lived secret in the header and have the **Lambda** exchange + cache it. That is strictly immortal, but it **puts a durable secret on the wire on every request** — the less secure option. It is retained **only** as a contingency if the chosen per-connect model cannot satisfy AC-G1 even after lengthening the minted-token TTL (see guardrail).
   - **Functionality guardrail for the chosen design:** `headersHelper` refreshes per-connect, not per-request. Mint a TTL comfortably longer than expected connection lifetimes; **AC-G1 (>24h session survives) is the hard gate.** If verification shows a single long connection going stale, lengthen the minted TTL — never reintroduce a wire secret.

> Track A is deliberately **immune to every upstream client gap**: it needs no client refresh (`#58607`), no client `client_credentials` _grant in the transport_ (`#26675` — the minting **command** does the grant out-of-band, not the MCP client), and it tolerates once-at-spawn resolution because each connect re-mints. With the chosen `headersHelper` form, **no long-lived credential is ever transmitted.**

### Track B — MCP OAuth connector (Claude Code web)

CC web requires OAuth and is registered out-of-band from `.mcp.json`.

1. **Implement the MCP Authorization spec** on the three Lambdas: serve OAuth 2.0 Protected Resource Metadata, return `401` + `WWW-Authenticate` pointing at the Cognito authorization server, and accept the resulting access token. (Cognito is already an OAuth server; this is mostly metadata + a 401 challenge path, reusing the JWKS validation we have.) Claude.ai supports OAuth DCR, CIMD, and Anthropic-held-credentials flows; **static bearer is confirmed unsupported** in the web UI, so OAuth is mandatory.
2. **Register each server as a custom connector** in claude.ai (Settings → Connectors; on Team/Enterprise this is **Org settings → Connectors, Owner-only**). Connectors added in claude.ai **auto-sync into Claude Code** when logged in with the same account — so registration is once. Servers are already **publicly reachable** (API Gateway URLs); AWS egress is **not** blocked by the cloud proxy (only `*.atlassian.net` / `api.atlassian.com` are).
3. **Confirm inbound reachability from Anthropic.** Anthropic's connector fetchers reach the server **over the public internet from Anthropic IP ranges, which are not published**. Our Gateways are public so this works as-is — but if we ever want to IP-restrict the Gateway/WAF, we cannot scope it to Anthropic without contacting Anthropic support. Decide whether to leave the MCP Gateways open (relying on OAuth for authz) or pursue an allowlist.
4. **Accept the residual limitation.** CC web drives the interactive consent (human in a browser — fine), but inherits the **no-auto-mid-session-refresh** gap (`#58607`). Until that ships upstream, a CC-web session that outlives the access token must re-consent. Document this; do not block the RFC on it.

### Per-environment outcome matrix

| Environment            | Mechanism                                                                              | Mid-session safe?                           | Headless?           | Status after this RFC                  |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------- | -------------------------------------- |
| Local CLI / worktree   | Track A — local `headersHelper` minting; Lambda validates only                         | ✅ (per-connect re-mint; AC-G1 gate)        | ✅                  | Seamless                               |
| Copilot Coding Agent   | Track A — machine grant minted in `copilot-setup-steps.yml` (SigV4/OIDC retired, OQ-3) | ✅ (short-lived tasks)                      | ✅                  | Seamless / unified                     |
| Claude Code on the web | Track B (OAuth connector)                                                              | ⚠️ re-consent on expiry (upstream `#58607`) | n/a (human present) | Reachable; "seamless" pending upstream |

## Acceptance Criteria

Grouped and mechanically checkable. **AC-G**, **AC-A**, **AC-B**, **AC-X** = General, Track A, Track B, Cross-cutting.

### General

- **AC-G1** A local Claude Code session that has been running **> 24 hours** can call `jira_auth_status`, `github_pr_dashboard`, and a `ci_*` tool and receive successful (non-auth-error) responses without any session restart or manual `mcp-auth.mjs` run during the session.
- **AC-G2** No new long-running local process exists as a result of this change: process count for MCP servers is unchanged or reduced (verified via `make kill-stale` / process listing). No user step "start the proxy" appears in any runbook.
- **AC-G3** The SessionStart MCP health-check banner shows **no** `[MCP WARNING] MCP_AUTH_TOKEN has expired` for a machine-credentialed session, because there is no per-session expiring token to warn about (or the check is updated to validate the new credential).

### Track A — local minting + server-side validation

- **AC-A1** A Cognito resource server exposing **per-server scopes** (`mcp/jira`, `mcp/github`, `mcp/ci`) and a confidential `client_credentials` app client exist in Terraform; `terraform plan` is clean and the CI deploy role has the IAM permissions to apply them (per `terraform-permission-planning`).
- **AC-A2** `.mcp.json` for `legacy-sports-{github,jira,ci}` contains **no** `${MCP_AUTH_TOKEN}` and **no long-lived secret in any header**; it declares a `headersHelper` command that emits the `Authorization` header.
- **AC-A3** The `headersHelper` minting command performs the `client_credentials` exchange locally and outputs a valid short-lived bearer token; it reads the machine secret from secure local storage, never prints the secret, and exits non-zero with an actionable message if the secret is missing/invalid. Unit tests cover: successful mint, missing-secret, Cognito-error, and token-shape.
- **AC-A4 (security gate)** A network capture / proxy log of MCP traffic shows **only short-lived access tokens** in `Authorization` headers — the long-lived machine secret never appears on the wire. The shared `mcp-bearer-auth.ts` accepts the short token (validates **the server's own scope** — e.g. the Jira Lambda requires `mcp/jira` — plus issuer, signature, exp) and rejects a token bearing only another server's scope; it also accepts the legacy ID token during migration. Unit tests cover correct-scope, wrong-scope rejection, legacy token, and malformed/expired/absent.
- **AC-A5** The machine secret is stored outside plaintext where the platform allows (OS keychain locally; environment secret on Copilot), has a **documented rotation procedure**, and revoking it denies access within one minted-token lifetime. Minting requests only the scopes the context needs; revoking a single scope denies just that server.
- **AC-A6** Copilot Coding Agent reaches all three servers using the same machine-credential model: `copilot-setup-steps.yml` mints the bearer from the env-secret and the Copilot MCP config sends it; a Copilot task exercises `jira_*`/`github_*`/`ci_*` successfully.
- **AC-A7 (unification cleanup)** After Copilot cutover, the SigV4/OIDC path is removed: AWS_IAM Lambda Function URLs deleted, the `mcp_invoke` IAM policy deleted, and `isFunctionUrlInvocation()` removed from the shared auth module. `terraform plan` is clean and no caller depends on the Function URLs.

### Track B — Claude Code web

- **AC-B1** Each Lambda serves OAuth 2.0 Protected Resource Metadata and returns a correct `401 + WWW-Authenticate` challenge when presented no/invalid token (contract test).
- **AC-B2** A custom connector registered in CC web with the Cognito OAuth client completes the browser consent flow and successfully invokes at least one tool per server from a CC-web session (manual verification, screenshot in the PR).
- **AC-B3** The CC-web re-consent-on-expiry limitation is documented in `.agents/skills/cloud-agent-mode/SKILL.md` with a link to `claude-code#58607`, and `mcp-diagnostics` is updated to recognize the new posture.

### Cross-cutting

- **AC-X1** The three duplicated `mcp-bearer-auth.ts` files are collapsed into **one** shared module imported by all three servers (G7); the duplicate copies are deleted.
- **AC-X2** `scripts/mcp-auth.mjs` is updated (or a new path added) to provision/refresh the machine credential without the interactive hosted-UI flow; the docstring and any setup runbook are updated.
- **AC-X3** Docs updated: `AGENTS.md` MCP section, `docs/dev-process/session-startup.md`, `.agents/skills/mcp-diagnostics/SKILL.md`, and the memory note "Mid-Session 401 / Token Expiry" reflect the new model.
- **AC-X4** `make pc` passes; new auth code has unit tests; no `@ts-ignore`/`eslint-disable`; `LOGGER` used (not `console.*`).

## Implementation Gaps

Explicit catalog of what is missing today — split into **ours** (we can close) and **upstream** (we must design around).

### Ours (closable in this work)

| #     | Gap                                                                                                                                                                                                                                                      | Where                                      | Closes which AC |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------- |
| GAP-1 | No machine (`client_credentials`) Cognito client or resource server exists — only the public interactive `mcp_cli`.                                                                                                                                      | `terraform/main/lambda-mcp-api-gateway.tf` | AC-A1           |
| GAP-2 | Lambda validates a _user ID token_ only; it must also accept the machine **access token** carrying **the server's own `mcp/*` scope**. With `headersHelper` chosen (OQ-2), the Lambda does **not** need exchange/caching logic — minting is client-side. | `mcp-bearer-auth.ts`                       | AC-A4           |
| GAP-3 | `mcp-bearer-auth.ts` is **copy-pasted in 3 places** (~203 lines each) — drift risk, 3× test surface.                                                                                                                                                     | `tools/mcp/{github,jira,ci}-server/src/`   | AC-X1           |
| GAP-4 | No OAuth Protected Resource Metadata / `WWW-Authenticate` challenge on the Lambdas (required for CC-web connectors).                                                                                                                                     | Lambda handlers                            | AC-B1           |
| GAP-5 | `mcp-auth.mjs` only knows the interactive flow; no headless provisioning of a machine secret.                                                                                                                                                            | `scripts/mcp-auth.mjs`                     | AC-X2           |
| GAP-6 | SessionStart health-check **warns but never remediates** and assumes a per-session ID token.                                                                                                                                                             | SessionStart hook                          | AC-G3           |
| GAP-7 | No secret-rotation procedure for a long-lived MCP credential.                                                                                                                                                                                            | docs + Secrets Manager                     | AC-A5           |
| GAP-8 | The chosen `headersHelper` minting command (`scripts/mcp-mint-token.mjs` or similar) does not yet exist, and `.mcp.json` does not declare `headersHelper`.                                                                                               | `.mcp.json` + new script                   | AC-A2, AC-A3    |
| GAP-9 | Dual auth paths (bearer vs SigV4/OIDC) maintained in parallel. **Decision (OQ-3): unify** — remove the SigV4/OIDC path after Copilot cutover.                                                                                                            | terraform + bearer-auth                    | AC-A6, AC-A7    |

### Upstream (cannot close here — design around + track)

| #      | Gap                                                                                                                   | Issue                                                                         | Mitigation in this RFC                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-U1 | Claude Code does not auto-refresh MCP OAuth tokens mid-session.                                                       | [`claude-code#58607`](https://github.com/anthropics/claude-code/issues/58607) | Track A makes the client credential long-lived (no refresh needed). Track B/CC-web accepts re-consent until fixed.                        |
| GAP-U2 | Claude Code has no `client_credentials` grant for remote MCP.                                                         | [`claude-code#26675`](https://github.com/anthropics/claude-code/issues/26675) | Track A runs `client_credentials` **server-side** (Lambda), not in the client.                                                            |
| GAP-U3 | CC web connector UI has no bearer/static-token field (OAuth only).                                                    | [`claude-ai-mcp#112`](https://github.com/anthropics/claude-ai-mcp/issues/112) | Track B implements real OAuth so the OAuth-only UI suffices.                                                                              |
| GAP-U4 | Static `${ENV}` header substitution can drop the header on Windows.                                                   | [`claude-code#6204`](https://github.com/anthropics/claude-code/issues/6204)   | Validate header delivery on Windows during rollout; `headersHelper` is an escape hatch.                                                   |
| GAP-U5 | Anthropic publishes **no inbound IP allowlist** for connector fetchers; the server must be public-internet reachable. | Anthropic help center (custom connectors)                                     | MCP Gateways are already public; if IP-restriction is later required, contact Anthropic support. Authz relies on OAuth, not network ACLs. |

## Alternatives Considered

### Alternative A: Per-session stdio shim (local proxy per session)

Convert the three HTTP servers to local `tsx` stdio shims (like `make`/`nx`/`db`) that hold the refresh token and refresh internally.

**Why rejected**: N concurrent sessions → N extra resident node processes on top of the 7 existing stdio servers — material memory cost. Violates **G5**.

### Alternative B: Single shared local refreshing daemon

One long-lived local proxy serving all sessions, auto-started by the SessionStart hook.

**Why rejected**: Reintroduces a daemon the user must (or the hook must) keep alive — lifecycle, port management, crash recovery, upgrades. Even hook-autostarted, it's a resident process and a new failure surface. Violates **G5** and adds operational burden.

### Alternative C: Pure client-side MCP OAuth (no server-side exchange)

Rely on Claude Code's native OAuth client to hold + refresh tokens.

**Why rejected**: Blocked by **GAP-U1** (no mid-session refresh) and **GAP-U2** (no `client_credentials`). Solves neither F1 nor F2 on today's client; would leave us waiting on upstream for the core fix. Retained _only_ as the CC-web registration mechanism (Track B), where OAuth is mandatory anyway.

### Alternative D: Just raise the token TTL to 24 h + auto-refresh on SessionStart

Bump Cognito `id_token_validity` to its 24 h max and have the SessionStart hook refresh proactively.

**Why rejected**: reduces but does not eliminate F1 (a >24 h session still dies), does nothing for F2/F3, and keeps a short-lived value in the frozen slot. It was considered as a Phase 0 band-aid but **struck (OQ-5)** in favor of going straight to Track A.

## Risks

| Risk                                                                                                                                                          | Likelihood                                                              | Impact  | Mitigation                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long-lived machine secret leaks (broader blast radius than an 8 h token)                                                                                      | Low (chosen design keeps it **off the wire** — `headersHelper`, OQ-2)   | High    | Never transmitted (AC-A4); stored in keychain/env-secret not plaintext (AC-A5); minted tokens scoped to per-server `mcp/*` scopes; rotation procedure + fast revocation. Only short-lived tokens transit. |
| Single long-lived connection outlives the per-connect minted token (functionality, not security)                                                              | Med                                                                     | Med     | Mint a TTL > expected connection lifetime; **AC-G1 (>24h survival) is the hard gate**; if it fails, lengthen minted TTL — never revert to a wire secret.                                                  |
| Loss of per-developer identity in the MCP token                                                                                                               | High (by design)                                                        | Low–Med | Non-goal; CloudTrail + Lambda request logging retain attribution at the infra layer. Optional user-token overlay remains available for interactive sessions.                                              |
| Lambda-side token cache serves a stale/expired token (**only applies to the rejected server-side-exchange fallback** — the chosen design has no Lambda cache) | Low (fallback only)                                                     | Med     | N/A for the chosen design (Lambda validates only). If the fallback is ever adopted: refresh within N minutes of `exp` and treat a Cognito 401 as cache-invalidate-and-retry-once.                         |
| CC-web custom connectors unavailable on our plan                                                                                                              | ~~Med~~ Low (OQ-1 resolved: supported all plans; Team/Ent = Owner-only) | Med     | Confirmed feasible 2026-05-31. Residual: requires an Org Owner to register (OQ-6); Track A delivers value regardless.                                                                                     |
| Terraform apply fails on IAM for the new Cognito resource server / client                                                                                     | Med                                                                     | Low     | Run `terraform-permission-planning` loop before pushing; predict→diff→patch the CI role policy in the same PR.                                                                                            |
| Per-connect minting latency (one local `client_credentials` round-trip at each connect)                                                                       | Low                                                                     | Low     | The chosen design mints client-side at connect (~100–300 ms once per connection), not per request; the Lambda does no exchange. Negligible in practice.                                                   |
| Windows `${ENV}` header drop (GAP-U4) bites the machine-secret header too                                                                                     | Low                                                                     | Med     | Verify header delivery on Windows in rollout; `headersHelper` escape hatch.                                                                                                                               |

## Test Plan

- **Unit (Track A — minting command):** successful local `client_credentials` mint; missing-secret → non-zero exit + actionable message; Cognito-error path; secret never written to stdout. (Closes AC-A3.)
- **Unit (Track A — validation):** shared `mcp-bearer-auth` accepts the machine access token (the server's own `mcp/*` scope, issuer, signature, exp); rejects a token bearing only another server's scope; accepts legacy ID token during migration; rejects malformed/expired/absent. (Closes AC-A4 validation half.)
- **Security gate (Track A):** capture MCP traffic (proxy/network log) and assert the long-lived machine secret **never** appears in any `Authorization` header — only short-lived tokens. (Closes AC-A4 security half.)
- **Contract (Track B):** Lambda returns well-formed Protected Resource Metadata and `401 + WWW-Authenticate`; valid OAuth access token is accepted. (AC-B1.)
- **Integration (local):** long-running session simulation — connect, advance clock past 8 h (or use a short-TTL test pool), confirm all three servers still respond. (AC-G1.)
- **Manual (CC web):** register connectors, complete consent, invoke one tool per server, screenshot in PR. (AC-B2.)
- **Manual (Copilot):** run a Copilot task that exercises `jira_*`/`github_*`/`ci_*`. (AC-A6.)
- **Regression:** `make pc`; verify no extra resident processes (AC-G2); verify SessionStart banner clean (AC-G3).
- Link/author a full test plan via `testplan_extract` once ACs are frozen.

## Rollout

- **Phase 0 — struck (OQ-5).** No 24 h-TTL stopgap; we go straight to Track A.
- **Phase 1 (Track A core):** add Cognito resource server (per-server scopes) + machine client (Terraform); dedup + extend `mcp-bearer-auth` with dual-token acceptance behind a flag; deploy Lambdas. **Dual-accept** means zero downtime — old ID tokens still work.
- **Phase 2 (Track A cutover + unification):** switch `.mcp.json` (`headersHelper`) and `copilot-setup-steps.yml` to the machine credential; validate local + Copilot; then drop legacy ID-token acceptance and the `${MCP_AUTH_TOKEN}` path, and **retire the SigV4/OIDC path** (delete Function URLs, `mcp_invoke` policy, `isFunctionUrlInvocation()`) per OQ-3 (AC-A7).
- **Phase 3 (Track B):** OAuth metadata + challenge on Lambdas; register CC-web connectors; document residual re-consent limitation.
- **Rollback:** each phase is independently revertible. Track A dual-accept means re-enabling the legacy path is a flag flip; reverting `.mcp.json` restores the old header. The SigV4/OIDC retirement (Phase 2) should land **after** Copilot is verified on the machine grant, so reverting it is a Terraform revert if needed.

## Open Questions

- **OQ-1 — RESOLVED (2026-05-31).** Yes: claude.ai supports **arbitrary custom remote MCP connectors** by URL (Settings → Connectors), and they **auto-sync into Claude Code** on the same account. Constraints confirmed: **OAuth only — no static-bearer field** (forces Track B step 1); on **Team/Enterprise only an Org Owner** can add the connector (Free = 1, Pro/Max unlimited); the server must be **public-internet reachable from Anthropic IPs, which are not published** (new GAP-U5). **Track B is feasible.** Remaining sub-decision folded into OQ-6.
- **OQ-6 — RESOLVED.** The RFC author (an Org Owner) will register the three connectors in claude.ai. MCP Gateways stay **publicly reachable with OAuth-only authorization** (no Anthropic-IP allowlist); optional WAF rate-limiting may be added as defense-in-depth. Security review should confirm the OAuth-only posture meets the "solid auth" bar.
- **OQ-2 — RESOLVED (most-secure-without-compromise):** use **`headersHelper` minting short-lived tokens locally per connect** — the long-lived machine secret never transits the wire (AC-A4) and stays in keychain/env-secret (AC-A5). Server-side exchange is retained as a fallback only if the `headersHelper` per-connect model can't satisfy AC-G1 (>24h survival) even after lengthening the minted-token TTL. Still needs security review _ratification_ of the chosen design, but the direction is set.
- **OQ-3 — RESOLVED: unify.** Copilot moves onto the machine credential like local. `copilot-setup-steps.yml` (already headless, already holds env secrets) performs the `client_credentials` mint and supplies the bearer to its MCP config; Copilot tasks are short-lived so per-connect re-minting is unnecessary there. Once cut over, **retire the SigV4/OIDC path**: delete the AWS_IAM Lambda Function URLs, the `mcp_invoke` IAM policy, and the `isFunctionUrlInvocation()` bypass in `mcp-bearer-auth.ts`. One auth path everywhere (see AC-A6, AC-A7, GAP-9).
- **OQ-4 — RESOLVED: per-server scopes.** Define `mcp/jira`, `mcp/github`, `mcp/ci` as distinct resource-server scopes (least privilege); each Lambda accepts only its own scope, so a leaked token is contained to the server(s) it was minted for. (Updates AC-A1, AC-A4, AC-A5.)
- **OQ-5 — RESOLVED: skip Phase 0, go straight to Track A.** No 24 h-TTL stopgap; interim pain is accepted while Track A is built. Phase 0 struck from Rollout.

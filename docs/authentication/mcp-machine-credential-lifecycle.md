# MCP machine-credential lifecycle — rotation, revocation, blast radius

> **Runbook scope.** This document covers the lifecycle of the **long-lived Cognito
> `client_credentials` machine secret** introduced by epic
> [LS-5089](https://bkrupa.atlassian.net/browse/LS-5089) (RFC:
> [`docs/rfcs/draft-seamless-mcp-auth.md`](../rfcs/draft-seamless-mcp-auth.md), Track A).
> It is the operator procedure for **rotating**, **revoking**, and reasoning about the
> **blast radius** of that secret. Satisfies RFC **AC-A5** / closes RFC **GAP-7**.
>
> **Audience:** an org admin / platform engineer with AWS console access to the account
> hosting the MCP Cognito user pool (`${name_prefix}-mcp-dev`).
>
> **Status.** The machine grant is **merged** — the Cognito resource server + confidential
> `client_credentials` app client landed in [LS-5090](https://bkrupa.atlassian.net/browse/LS-5090)
> ([`terraform/main/lambda-mcp-api-gateway.tf`](../../terraform/main/lambda-mcp-api-gateway.tf)),
> the shared bearer-token validator was consolidated and extended to accept the machine access
> token in [LS-5091](https://bkrupa.atlassian.net/browse/LS-5091)
> ([`lib/mcp-bearer-auth/src/index.ts`](../../lib/mcp-bearer-auth/src/index.ts)), and the local
> minting command landed in [LS-5092](https://bkrupa.atlassian.net/browse/LS-5092)
> ([`scripts/mcp-mint-token.mjs`](../../scripts/mcp-mint-token.mjs)). Every concrete identifier
> below is the real value its Terraform publishes. Two forward-looking items remain and are
> called out inline where relevant: **`TODO(LS-5098)`** (an automatic Secrets Manager rotation
> Lambda — not yet provisioned) and **RFC AC-X2** (a headless machine-secret provisioning path
> in `scripts/mcp-auth.mjs` — not yet implemented).

---

## 1. What the credential is

Track A of the seamless-MCP-auth design replaces the per-developer, browser-minted 8 h
Cognito **ID token** with a single, rotatable **machine credential**:

| Piece                   | What it is                                                                                                                                            | Where it lives                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Confidential client** | `aws_cognito_user_pool_client.mcp_machine` (`${name_prefix}-mcp-machine`) — `generate_secret = true`, `allowed_oauth_flows = ["client_credentials"]`. | Cognito user pool `${name_prefix}-mcp-dev`. **Separate** from the existing public `mcp_cli` client (which stays). |
| **Client secret**       | The long-lived secret half of the `client_credentials` grant. **This is the thing this runbook rotates.**                                             | Secrets Manager (canonical copy) → distributed to consumers (see §1.1).                                           |
| **Resource server**     | `aws_cognito_resource_server.mcp` (identifier `mcp`) exposing **per-server scopes** `mcp/jira`, `mcp/github`, `mcp/ci`.                               | Same user pool. Each MCP Lambda accepts **only its own scope** (least privilege — OQ-4).                          |
| **Minted access token** | A bearer token the client mints per-connect from the secret (TTL **24 h** — Cognito's per-token max). This is the only thing on the wire.             | Generated on demand by the `headersHelper` command; never persisted.                                              |

Concrete identifiers (from
[`terraform/main/lambda-mcp-api-gateway.tf`](../../terraform/main/lambda-mcp-api-gateway.tf)):

```
Confidential client      : aws_cognito_user_pool_client.mcp_machine   # name "${name_prefix}-mcp-machine"
Confidential client id   : SSM String aws_ssm_parameter.mcp_cognito_machine_client_id
                           at /${name_prefix}/mcp/cognito/machine-client-id
Client secret (canonical): aws_secretsmanager_secret.mcp_machine_client_secret
                           name "${environment}/mcp-machine-client-secret"
Resource server          : aws_cognito_resource_server.mcp   # identifier "mcp"
Scopes                   : mcp/jira, mcp/github, mcp/ci
Cognito token endpoint   : https://<domain>.auth.<region>.amazoncognito.com/oauth2/token
                           # domain from SSM /${name_prefix}/mcp/cognito/domain
Minted access-token TTL  : 24 h   # access_token_validity = 24 on mcp_machine (Cognito per-token max);
                           # long enough that a >24h session's single connection never goes stale (AC-G1)
```

> **The secret value is Terraform-managed and never hand-set.**
> `aws_secretsmanager_secret_version.mcp_machine_client_secret` sources its `secret_string`
> directly from `aws_cognito_user_pool_client.mcp_machine.client_secret`, so the canonical
> Secrets Manager copy is populated automatically on `terraform apply` — there is **no** manual
> `put-secret-value` bootstrap. (Trade-off: the value therefore lives in Terraform state; protect
> the state backend as for `database_password` in `secrets.tf`.) Rotation (§2) is consequently a
> single `terraform apply -replace=aws_cognito_user_pool_client.mcp_machine`.

### 1.1 Who holds a copy of the secret

| Consumer              | Storage                                                                                                                 | How it reads the secret                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Canonical**         | **Secrets Manager** (`aws_secretsmanager_secret.mcp_machine_client_secret`, `${environment}/mcp-machine-client-secret`) | Source of truth; populated from Terraform state on apply.                                                                                                                |
| **Local (developer)** | OS keychain where available; else `.env.local` (`MCP_MACHINE_CLIENT_ID` / `MCP_MACHINE_CLIENT_SECRET`)                  | `scripts/mcp-mint-token.mjs` (the `headersHelper`) reads it via `process.env` → `.env.local` and runs the `client_credentials` exchange locally.                         |
| **Copilot** (planned) | GitHub **environment secret** on the `copilot` environment (`MCP_MACHINE_CLIENT_ID` / `MCP_MACHINE_CLIENT_SECRET`)      | Phase-2 target (RFC **AC-A6**): `copilot-setup-steps.yml` mints the bearer from the env secret via `scripts/mcp-mint-token.mjs`. **Not yet wired** — see the note below. |

> **Copilot is not a machine-secret consumer _yet_.** Today the Copilot Coding Agent reaches the
> three hosted MCP Lambdas over a **separate** SigV4/OIDC path — the Lambdas are also exposed as
> AWS_IAM Function URLs, and the GitHub Actions OIDC role (`mcp_invoke` IAM policy) signs the
> requests; the bearer check is bypassed for Function-URL invocations
> (`isFunctionUrlInvocation()` in [`lib/mcp-bearer-auth/src/index.ts`](../../lib/mcp-bearer-auth/src/index.ts)).
> Migrating Copilot onto the machine credential (RFC **AC-A6**) and **then** retiring the
> SigV4/OIDC path (RFC **AC-A7**) are the Phase-2 cutover. Until AC-A6 lands, **rotating the
> secret does not affect Copilot** — only the canonical and local copies (§2.3) need refreshing.

The secret is **the same value in every place that holds it**. Only short-lived minted access
tokens ever transit the MCP wire (see §3).

---

## 2. Rotation

Rotate on a schedule (recommended **90 days**) and immediately on any suspected exposure.
There are two procedures: **manual** (always available, the day-one path) and **automatic**
(Secrets Manager rotation, only once `TODO(LS-5098)` provisions a rotation Lambda).

> **Cognito reality check.** Cognito app-client secrets are **not** independently settable to
> an arbitrary value — you cannot "PUT" a chosen string as the secret. A Cognito client secret
> changes only when the **client is recreated** (or its secret is regenerated). "Rotation" of
> this credential therefore means **regenerate the confidential client's secret, let Terraform
> republish it, then refresh the pull-based consumers**. Both procedures below reflect that.

### 2.1 Manual rotation (the day-one procedure)

This is the always-available path until/unless an automatic rotation Lambda is wired up.

1. **Regenerate the secret (Terraform-managed, canonical).**

   ```
   terraform -chdir=terraform/main apply -replace=aws_cognito_user_pool_client.mcp_machine
   ```

   Replacing the client forces Cognito to generate a fresh secret. Terraform then re-publishes
   the new client id to SSM (`aws_ssm_parameter.mcp_cognito_machine_client_id`) **and** writes
   the new secret to Secrets Manager automatically, because
   `aws_secretsmanager_secret_version.mcp_machine_client_secret` sources its value from the
   client (§1). No manual `put-secret-value` step is required — the canonical copy is correct
   the moment the apply completes.
   - **Console fallback** (no Terraform): AWS console → Cognito → user pool `${name_prefix}-mcp-dev`
     → App clients → the `${name_prefix}-mcp-machine` client → regenerate the secret. Copy it
     **once** (Cognito shows it only at creation), then update the Secrets Manager secret value.
     Prefer the Terraform path so state does not drift.

   > **Secret hygiene.** Never embed the raw secret value in an `Edit`/`Write`/`Bash` argument,
   > a commit, or a chat message. See [`.agents/skills/secrets-handling/SKILL.md`](../../.agents/skills/secrets-handling/SKILL.md).

2. **Propagate to consumers** — §2.3. The canonical Secrets Manager copy is already current
   after step 1; the pull-based copies (local, and Copilot once AC-A6 lands) must be refreshed.

3. **Verify** — §2.4.

4. **Old secret is dead automatically.** Because `-replace` recreates the client, the old
   secret is invalidated by Cognito as part of the apply — there is no separate "retire the old
   client" step and no zero-downtime overlap window (re-provisioning is a single apply). This is
   the same lever used for revocation (§4).

### 2.2 Automatic rotation (Secrets Manager rotation Lambda — `TODO(LS-5098)`)

There is **no** rotation configuration on the secret today — `aws_secretsmanager_secret.mcp_machine_client_secret`
has no `aws_secretsmanager_secret_rotation`. Use this path only once **LS-5098** provisions a
rotation Lambda; until then use §2.1.

1. **Confirm rotation is configured.**

   ```
   aws_secretsmanager_describe_secret(secretId: "${environment}/mcp-machine-client-secret")   # legacy-sports-aws MCP tool
   ```

   Look for `RotationEnabled: true` and a `RotationRules` schedule. If absent, rotation is not
   yet wired (expected today) — fall back to §2.1.

2. **Trigger an out-of-cycle rotation** (AWS console → Secrets Manager → the secret → _Rotate
   secret immediately_, or `aws secretsmanager rotate-secret --secret-id <arn>`).

   For a Cognito client secret the rotation Lambda's four steps (`createSecret`, `setSecret`,
   `testSecret`, `finishSecret`) mean: regenerate the confidential client, stage the new secret
   in `AWSPENDING`, verify a `client_credentials` exchange succeeds for all three scopes, then
   promote `AWSPENDING` → `AWSCURRENT`.

3. **Propagate to consumers** — §2.3. Secrets Manager rotation updates the **canonical** copy
   only; the pull-based copies must be refreshed.

4. **Verify** — §2.4.

### 2.3 Propagating a rotated secret to consumers

The canonical Secrets Manager value is current; now refresh the pull-based copies.

| Consumer    | Refresh step                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local**   | Each developer updates `MCP_MACHINE_CLIENT_ID` / `MCP_MACHINE_CLIENT_SECRET` in their OS keychain / `.env.local` from the new Secrets Manager value (a headless `node scripts/mcp-auth.mjs --machine` pull is **pending** — RFC **AC-X2** / `TODO`), then **restarts the Claude Code session** (MCP transports read credentials once at spawn). |
| **Copilot** | Once AC-A6 lands: update the GitHub **environment secret** on the `copilot` environment (Settings → Environments → `copilot` → Environment secrets) to the new value; the next Copilot task re-runs `copilot-setup-steps.yml` and mints from the new secret. **Until AC-A6, Copilot uses SigV4/OIDC and needs no refresh** (§1.1).              |

> **Why a session restart is required locally.** Per RFC F1 and
> [`.agents/skills/mcp-diagnostics/SKILL.md`](../../.agents/skills/mcp-diagnostics/SKILL.md)
> ("Mid-Session 401 / Token Expiry"), Claude Code resolves credentials at connection spawn and
> never re-reads them mid-session. A rotated secret only takes effect on the next session. The
> `headersHelper` design means the **minted token** refreshes per-connect, but the **secret it
> mints from** is still read at spawn.

### 2.4 Verifying a rotation

1. **Cognito exchange works for every scope.** From a machine holding the new secret, mint a
   token for each scope and confirm a `200`:

   ```
   # one per scope: mcp/jira, mcp/github, mcp/ci
   curl -s -X POST "https://<domain>.auth.<region>.amazoncognito.com/oauth2/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -u "<machine-client-id>:<new-secret>" \
     -d "grant_type=client_credentials&scope=mcp/jira"   # expect access_token in the JSON
   ```

   Or exercise the real `headersHelper` directly — it is **env-driven** (the server name selects
   the scope; there is no `--server`/`--check` flag):

   ```
   CLAUDE_CODE_MCP_SERVER_NAME=legacy-sports-jira node scripts/mcp-mint-token.mjs
   # success prints exactly: {"Authorization":"Bearer <short-lived access token>"}
   ```

2. **End-to-end through Claude Code.** In a freshly restarted session, call one tool per server
   and confirm non-auth responses: `jira_auth_status`, `github_pr_dashboard`, a `ci_*` tool
   (mirrors RFC AC-G1).

3. **Copilot** (once on the machine grant — AC-A6). Trigger a Copilot task that exercises
   `jira_*` / `github_*` / `ci_*` (RFC AC-A6).

4. **Old secret is dead.** Repeat step 1 with the **old** secret and confirm a `400/401`
   (`invalid_client`). After a `-replace` apply (§2.1) the old secret is invalidated by Cognito,
   so this should fail immediately.

---

## 3. Blast radius — why a long-lived secret is acceptable here

The headline risk of moving from an 8 h token to a long-lived secret is a **larger blast radius
on leak**. Track A's design deliberately shrinks that radius along three axes:

1. **The long-lived secret never transits the MCP wire.** The chosen design (RFC OQ-2) mints a
   bounded-lifetime access token **locally** via the `headersHelper` command and sends **only
   that token** in the `Authorization` header. The durable machine secret stays on the machine
   (OS keychain / `.env.local`) or, once AC-A6 lands, in the Copilot env-secret, and is used
   **only** for the local `client_credentials` exchange against Cognito (the secret only ever
   transits TLS to Cognito itself, which the grant requires). A network capture of MCP traffic
   shows only minted tokens (RFC AC-A4).

   > Contrast: the **legacy** scheme froze an 8 h ID token directly into the header, so the
   > credential-on-the-wire _was_ the credential. The new scheme's wire token is a per-server
   > access token that expires in ≤ 24 h and is worthless against the other two servers.

2. **Minted tokens are scoped per server, and the Lambdas enforce it.** The resource server
   exposes distinct scopes `mcp/jira`, `mcp/github`, `mcp/ci`; the minting command requests
   **only the one scope** the calling server needs (`SERVER_SCOPES` in `scripts/mcp-mint-token.mjs`),
   and the shared validator **rejects a machine token that does not carry the calling server's
   own scope** (`verifyBearerToken` → `tokenScopes(...).includes(requiredScope)` in
   [`lib/mcp-bearer-auth/src/index.ts`](../../lib/mcp-bearer-auth/src/index.ts); each Lambda
   passes its own `MCP_SCOPE.*`). So a token minted for `mcp/jira` is contained to the Jira
   server — useless against GitHub or CI — both at mint time and at the door (RFC OQ-4 / AC-A4).

3. **Leak of the secret is bounded by fast revocation.** If the long-lived secret itself leaks,
   revocation (§4) invalidates it immediately; already-minted tokens stay valid only until they
   expire — at most **one minted-token TTL (≤ 24 h)**. There is no refresh token to chase (the
   machine grant has no refresh token; `client_credentials` re-mints from the secret each time).

**Net:** the only durable secret stays off the wire and in protected storage; everything on the
network is a per-server-scoped access token that the Lambdas enforce; and a compromised secret is
killed in ≤ one minted-token TTL. This is the reasoning that makes the long-lived credential an
acceptable trade for eliminating mid-session death (RFC G1) and enabling a headless/Copilot path
(RFC G2–G3).

---

## 4. Fast revocation

Use when the secret (or a single server's access) must be denied **now** — suspected leak,
offboarding, or containing a compromised server.

### 4.1 Revoke everything (kill the whole machine credential)

The fastest, surest kill is to **invalidate the secret at Cognito** so no new tokens can be
minted:

1. **Regenerate or delete the confidential client.**
   - Terraform-managed (preferred): `terraform -chdir=terraform/main apply -replace=aws_cognito_user_pool_client.mcp_machine`
     regenerates the secret (and republishes the new one), invalidating the old one; or remove
     the resource entirely to delete the client.
   - Console: AWS console → Cognito → user pool `${name_prefix}-mcp-dev` → App clients → the
     `${name_prefix}-mcp-machine` client → **delete** (or regenerate its secret). The next
     `headersHelper` mint fails with `invalid_client`.

2. **Canonical copy follows automatically.** Because the Secrets Manager version is sourced from
   the client (§1), a `-replace` apply updates the canonical copy to the new secret in the same
   apply; a full **delete** removes the client and you should also remove/disable the secret
   resource so nothing re-distributes a dead value.

3. **Bound on already-minted tokens.** Existing **minted access tokens** remain valid until they
   expire — at most **one minted-token TTL (≤ 24 h)**. Cognito access tokens are self-validating
   JWTs (the Lambdas check signature + issuer + `exp` + scope, with no per-request Cognito call),
   so they **cannot be individually revoked** before expiry. The 24 h `access_token_validity` is
   the upper bound on this window (chosen so a >24 h session's single connection never goes stale,
   AC-G1).

4. **Re-provision** with a fresh secret via §2 when ready, and notify developers to refresh their
   local copy + restart their sessions.

### 4.2 Revoke a single server (deny just `jira`, `github`, or `ci`)

Because tokens are **scoped per server and enforced server-side**, you can deny one server
without touching the others — useful when only one server is implicated (e.g. a leaked token seen
with `mcp/github`).

- **Stop minting that scope:** remove the scope from the machine client's
  `allowed_oauth_scopes` in Terraform (it currently references
  `aws_cognito_resource_server.mcp.scope_identifiers`, i.e. all three; pin it to the subset you
  want to keep) and apply. New mints for the dropped scope fail; the other scopes keep working.
- **Reject that scope server-side (no Cognito change):** the target Lambda already requires its
  own scope (`MCP_SCOPE.<server>`). To harden a single server immediately, set its
  `MCP_AUTH_MODE=machine` (drop legacy-ID-token acceptance for that Lambda) and redeploy, or — to
  fail that Lambda closed entirely — set its `MCP_COGNITO_AUDIENCE` to a non-matching value (this
  denies the legacy ID-token path; the machine path is already gated on scope). `MCP_AUTH_MODE`
  and `MCP_COGNITO_AUDIENCE` are the real env levers in
  [`lib/mcp-bearer-auth/src/index.ts`](../../lib/mcp-bearer-auth/src/index.ts) — per-server scope
  acceptance is keyed off the calling Lambda's own `MCP_SCOPE.<server>`, not a separate override.
- **Bound:** as in §4.1 step 3, already-minted tokens for that scope stay valid until they expire
  (≤ one minted-token TTL).

> **Per-server scoping is the whole point of OQ-4.** A single scope can be revoked to deny
> exactly one server, leaving the other two reachable — the dual benefit of least privilege
> (contained leak) and surgical revocation (no full outage to contain one server).

---

## 5. Quick reference

| I need to…                          | Go to | One-liner                                                                                           |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| Rotate manually                     | §2.1  | `terraform apply -replace=aws_cognito_user_pool_client.mcp_machine` → refresh consumers → verify.   |
| Rotate on schedule (auto)           | §2.2  | _Pending `TODO(LS-5098)`._ Trigger Secrets Manager rotation → refresh consumers → verify.           |
| Push a rotated secret to my machine | §2.3  | Update `MCP_MACHINE_CLIENT_*` in keychain / `.env.local` → restart session. (Headless pull: AC-X2.) |
| Push a rotated secret to Copilot    | §2.3  | _After AC-A6._ Update the `copilot` environment secret; next task re-mints.                         |
| Kill the credential entirely        | §4.1  | `-replace` (or delete) the `mcp_machine` Cognito client → canonical secret follows.                 |
| Deny just one server                | §4.2  | Drop that `mcp/<server>` scope from the client (or `MCP_AUTH_MODE=machine` on that Lambda).         |
| Understand why long-lived is safe   | §3    | Secret stays off the wire (headersHelper); wire tokens are ≤24h + per-server scoped + enforced.     |

---

## 6. Related

- RFC: [`docs/rfcs/draft-seamless-mcp-auth.md`](../rfcs/draft-seamless-mcp-auth.md) — Track A
  design, AC-A4/A5/A6/A7, AC-X2, GAP-2/GAP-7, OQ-2/OQ-4, Phase 1 vs Phase 2 cutover.
- [`terraform/main/lambda-mcp-api-gateway.tf`](../../terraform/main/lambda-mcp-api-gateway.tf) —
  the Cognito pool, public `mcp_cli` client, machine client `mcp_machine`, resource server `mcp`,
  SSM `machine-client-id`, and Secrets Manager `${environment}/mcp-machine-client-secret`.
- [`lib/mcp-bearer-auth/src/index.ts`](../../lib/mcp-bearer-auth/src/index.ts) — the consolidated
  validator (LS-5091): signature + issuer + `exp` always, then per-`MCP_AUTH_MODE` acceptance of
  the machine access token (its `mcp/*` scope) and/or the legacy ID token (`MCP_COGNITO_AUDIENCE`).
- [`scripts/mcp-mint-token.mjs`](../../scripts/mcp-mint-token.mjs) — the env-driven `headersHelper`
  (LS-5092); reads `MCP_MACHINE_CLIENT_ID` / `MCP_MACHINE_CLIENT_SECRET` / `MCP_AUTH_COGNITO_DOMAIN`.
- [`scripts/mcp-auth.mjs`](../../scripts/mcp-auth.mjs) — current interactive token flow; gains a
  headless machine-provisioning path under RFC **AC-X2** (`--machine`, not yet implemented).
- [`.agents/skills/mcp-diagnostics/SKILL.md`](../../.agents/skills/mcp-diagnostics/SKILL.md) —
  "Mid-Session 401 / Token Expiry" and why a session restart is required after any credential
  change.
- [`.agents/skills/secrets-handling/SKILL.md`](../../.agents/skills/secrets-handling/SKILL.md) —
  never embed raw secret values in tool calls or commits.

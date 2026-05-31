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
> **Status:** the machine grant itself is delivered by
> [LS-5090](https://bkrupa.atlassian.net/browse/LS-5090) (the Cognito resource server +
> confidential `client_credentials` app client). At the time of writing LS-5090 has **not
> merged**, so every concrete identifier below (client id, secret ARN, SSM paths, resource-
> server identifier) is marked **`TODO(LS-5090)`**. When LS-5090 lands, replace each marker
> with the value its Terraform publishes and delete this status note. The **procedures** are
> stable regardless of the exact ARNs.

---

## 1. What the credential is

Track A of the seamless-MCP-auth design replaces the per-developer, browser-minted 8 h
Cognito **ID token** with a single, rotatable **machine credential**:

| Piece                   | What it is                                                                                                       | Where it lives                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Confidential client** | A Cognito app client with `generate_secret = true`, `allowed_oauth_flows = ["client_credentials"]`.              | Cognito user pool `${name_prefix}-mcp-dev`. **Separate** from the existing public `mcp_cli` client (which stays). |
| **Client secret**       | The long-lived secret half of the `client_credentials` grant. **This is the thing this runbook rotates.**        | Secrets Manager (canonical copy) → distributed to consumers (see §1.1).                                           |
| **Resource server**     | A Cognito resource server exposing **per-server scopes** `mcp/jira`, `mcp/github`, `mcp/ci`.                     | Same user pool. Each MCP Lambda accepts **only its own scope** (least privilege — OQ-4).                          |
| **Minted access token** | A **short-lived** bearer token the client mints per-connect from the secret. This is the only thing on the wire. | Generated on demand by the `headersHelper` command; never persisted.                                              |

`TODO(LS-5090)` — fill in concrete identifiers once the grant lands:

```
Confidential client id : TODO(LS-5090)   # e.g. published to SSM /${name_prefix}/mcp/cognito/machine-client-id
Client secret (canonical): TODO(LS-5090)  # Secrets Manager ARN, e.g. arn:aws:secretsmanager:<region>:<acct>:secret:${name_prefix}/mcp/machine-client-secret-XXXXXX
Resource server id      : TODO(LS-5090)   # e.g. "mcp"
Scopes                  : mcp/jira, mcp/github, mcp/ci
Cognito token endpoint  : https://<domain>.auth.<region>.amazoncognito.com/oauth2/token   # domain from SSM /${name_prefix}/mcp/cognito/domain
Minted access-token TTL : TODO(LS-5090)   # AC-G1 gate: long enough that a >24h session's single connection never goes stale
```

> The existing SSM publishing pattern (see
> [`terraform/main/lambda-mcp-api-gateway.tf`](../../terraform/main/lambda-mcp-api-gateway.tf),
> `aws_ssm_parameter.mcp_cognito_*`) writes to `/${name_prefix}/mcp/cognito/<key>`. LS-5090 is
> expected to follow the same convention for the machine client id; the **secret** goes to
> Secrets Manager (not SSM `String`) so it can carry a rotation schedule.

### 1.1 Who holds a copy of the secret

The secret has exactly three consumers. Rotation (§2) must reach all three.

| Consumer              | Storage                                                                                                      | How it reads the secret                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Canonical**         | **Secrets Manager** (`TODO(LS-5090)` ARN)                                                                    | Source of truth; rotation lands here first.                                                                                      |
| **Local (developer)** | OS keychain where available; else `.env.local` (`MCP_MACHINE_CLIENT_SECRET`, `TODO(LS-5090)` exact var name) | `scripts/mcp-mint-token.mjs` (the `headersHelper`, `TODO(LS-5090)`) reads it and runs the `client_credentials` exchange locally. |
| **Copilot**           | GitHub **environment secret** on the `copilot` environment (same value shape as local)                       | `.github/copilot/copilot-setup-steps.yml` mints the bearer from the env secret before MCP config is written.                     |

The secret is **the same value in all three places**. Only short-lived minted access tokens
ever transit the network (see §3).

---

## 2. Rotation

Rotate on a schedule (recommended **90 days**) and immediately on any suspected exposure.
There are two procedures: **automatic** (Secrets Manager rotation, if configured by LS-5090)
and **manual** (always available).

> **Cognito reality check.** Cognito app-client secrets are **not** independently settable to
> an arbitrary value — you cannot "PUT" a chosen string as the secret. A Cognito client secret
> changes only when the **client is recreated** (or its secret is regenerated via the API where
> supported). "Rotation" of this credential therefore means **mint a new confidential client (or
> regenerate its secret), distribute the new secret, then retire the old client**. Both
> procedures below reflect that. `TODO(LS-5090)` — if LS-5090 ships a two-client (blue/green)
> Terraform layout to make this seamless, document the exact resource names here.

### 2.1 Automatic rotation (Secrets Manager rotation Lambda)

Use this path **only if LS-5090 provisioned a rotation configuration** on the secret
(`aws_secretsmanager_secret_rotation` + a rotation Lambda). If it did not, skip to §2.2.

1. **Confirm rotation is configured.**

   ```
   aws_secretsmanager_describe_secret(secretId: "TODO(LS-5090)")   # legacy-sports-aws MCP tool
   ```

   Look for `RotationEnabled: true` and a `RotationRules` schedule.

2. **Trigger an out-of-cycle rotation** (AWS console → Secrets Manager → the secret → _Rotate
   secret immediately_, or `aws secretsmanager rotate-secret --secret-id <arn>`).

   The rotation Lambda performs the four standard steps (`createSecret`, `setSecret`,
   `testSecret`, `finishSecret`). For a Cognito client secret this means: create/regenerate the
   confidential client, write the new secret to the `AWSPENDING` stage, verify a
   `client_credentials` exchange against the new secret succeeds for all three scopes, then
   promote `AWSPENDING` → `AWSCURRENT`.

3. **Propagate to consumers** — see §2.3. Secrets Manager rotation updates the **canonical**
   copy only; local and Copilot copies are pull-based and must be refreshed.

4. **Verify** — see §2.4.

### 2.2 Manual rotation (no rotation Lambda configured)

This is the always-available fallback and the expected day-one procedure until/unless a
rotation Lambda is wired up.

1. **Mint the replacement secret.**
   - Preferred (Terraform-managed): bump the confidential client (or its `blue`/`green`
     counterpart) in [`terraform/main/lambda-mcp-api-gateway.tf`](../../terraform/main/lambda-mcp-api-gateway.tf)
     so a fresh secret is generated, `terraform plan` (clean), then `terraform apply`. Terraform
     writes the new client id to SSM and (if LS-5090 wires it) the new secret to Secrets Manager.
     `TODO(LS-5090)` — record the exact resource address to taint/replace, e.g.
     `terraform apply -replace=aws_cognito_user_pool_client.mcp_machine`.
   - Console fallback: AWS console → Cognito → user pool `${name_prefix}-mcp-dev` → App clients
     → the machine client → regenerate the secret (or create a new client with identical scopes
     and `client_credentials` flow). Copy the new secret **once** — Cognito shows it only at
     creation.

2. **Write the new secret to the canonical store (Secrets Manager).**

   ```
   # Do NOT paste the raw secret into a tool-call argument (secrets-handling skill).
   # Use the AWS console "Set secret value" UI, or pipe from a file:
   aws secretsmanager put-secret-value --secret-id "TODO(LS-5090)" \
     --secret-string file://./new-secret.json    # then shred the file
   ```

   > **Secret hygiene.** Never embed the raw secret value in an `Edit`/`Write`/`Bash` argument,
   > a commit, or a chat message. See [`.agents/skills/secrets-handling/SKILL.md`](../../.agents/skills/secrets-handling/SKILL.md).

3. **Propagate to consumers** — §2.3.

4. **Retire the old client/secret** only **after** §2.4 verification passes for the new secret —
   then disable or delete the old confidential client (or `aws secretsmanager` removes the old
   staged version). Keeping the old one live briefly gives a zero-downtime overlap; retiring it
   is what actually invalidates the old credential (this doubles as the revocation step — §4).

### 2.3 Propagating a rotated secret to consumers

The canonical Secrets Manager value is updated; now refresh the two pull-based copies.

| Consumer    | Refresh step                                                                                                                                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local**   | Each developer re-runs the provisioning command — `node scripts/mcp-auth.mjs --machine` (`TODO(LS-5090)` exact flag added by AC-X2) — which pulls the new secret from Secrets Manager into the OS keychain / `.env.local`, then **restarts the Claude Code session** (MCP transports read credentials once at spawn). |
| **Copilot** | Update the GitHub **environment secret** on the `copilot` environment (Settings → Environments → `copilot` → Environment secrets → the machine-secret entry) to the new value. The next Copilot task re-runs `copilot-setup-steps.yml` and mints from the new secret automatically.                                   |

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

   `TODO(LS-5090)` — once `scripts/mcp-mint-token.mjs` exists, prefer
   `node scripts/mcp-mint-token.mjs --server jira --check` over raw `curl`.

2. **End-to-end through Claude Code.** In a freshly restarted session, call one tool per server
   and confirm non-auth responses: `jira_auth_status`, `github_pr_dashboard`, a `ci_*` tool
   (mirrors RFC AC-G1).

3. **Copilot.** Trigger a Copilot task that exercises `jira_*` / `github_*` / `ci_*` (RFC AC-A6).

4. **Old secret is dead.** Repeat step 1 with the **old** secret and confirm a `400/401`
   (`invalid_client`). If the old secret still works, the old client was not retired — finish
   §2.2 step 4.

---

## 3. Blast radius — why a long-lived secret is acceptable here

The headline risk of moving from an 8 h token to a long-lived secret is a **larger blast radius
on leak**. Track A's design deliberately shrinks that radius along three axes:

1. **The long-lived secret never transits the wire.** The chosen design (RFC OQ-2) mints a
   **short-lived access token locally** via the `headersHelper` command and sends **only that
   token** in the `Authorization` header. The durable machine secret stays on the machine (OS
   keychain / `.env.local`) or in the Copilot env-secret and is used **only** for the local
   `client_credentials` exchange against Cognito. A network capture of MCP traffic shows only
   short-lived tokens (RFC AC-A4). The rejected alternative — putting the secret in the header
   and exchanging server-side — was rejected precisely because it would put a durable secret on
   the wire on every request.

   > Contrast: the **legacy** scheme froze an 8 h ID token directly into the header, so the
   > credential-on-the-wire _was_ the credential. The new scheme's wire token is worthless after
   > its short TTL and is scoped to a single server.

2. **Minted tokens are scoped per server.** The resource server exposes distinct scopes
   `mcp/jira`, `mcp/github`, `mcp/ci`, and **each Lambda accepts only its own scope** (RFC OQ-4,
   AC-A4). A token minted for `mcp/jira` is rejected by the GitHub and CI Lambdas. The minting
   command requests **only the scope(s) the context needs**. So even a leaked **minted token**
   is contained to one server for the remainder of its short TTL.

3. **Leak of the secret is bounded by fast revocation.** If the long-lived secret itself leaks,
   revocation (§4) invalidates it within **one minted-token lifetime** — the upper bound on how
   long any already-minted token stays valid. There is no 30-day refresh token to chase (the
   machine grant has no refresh token; `client_credentials` re-mints from the secret each time).

**Net:** the only durable secret stays off the wire and in protected storage; everything on the
network is short-lived and single-server-scoped; and a compromised secret is killed in one TTL.
This is the reasoning that makes the long-lived credential an acceptable trade for eliminating
mid-session death (RFC G1) and enabling a headless/Copilot path (RFC G2–G3).

---

## 4. Fast revocation

Use when the secret (or a single server's access) must be denied **now** — suspected leak,
offboarding, or containing a compromised server.

### 4.1 Revoke everything (kill the whole machine credential)

The fastest, surest kill is to **invalidate the secret at Cognito** so no new tokens can be
minted:

1. **Disable or delete the confidential client.** AWS console → Cognito → user pool
   `${name_prefix}-mcp-dev` → App clients → the machine client → **delete** (or regenerate its
   secret, which invalidates the old one). Deletion stops all new `client_credentials` exchanges
   immediately — the next `headersHelper` mint fails with `invalid_client`.
   - Terraform-managed: `terraform apply -replace=aws_cognito_user_pool_client.mcp_machine`
     (`TODO(LS-5090)` exact address) regenerates the secret; or remove the resource to delete it.

2. **Scrub the canonical copy.** Overwrite/disable the Secrets Manager secret (`TODO(LS-5090)`
   ARN) so nothing re-distributes the dead value.

3. **Bound on already-minted tokens.** Existing **minted access tokens** remain valid until they
   expire — at most **one minted-token TTL** (`TODO(LS-5090)` minutes). Cognito access tokens are
   self-validating JWTs (the Lambdas check signature + `exp` + scope, with no per-request Cognito
   call), so they **cannot be individually revoked** before expiry. Keep the minted TTL short
   enough that this window is acceptable; this is the security trade-off behind the AC-G1 TTL
   choice (long enough for a connection, short enough to bound a leak).

4. **Re-provision** with a fresh secret via §2 when ready, and notify developers to re-run the
   local provisioning command + restart their sessions.

### 4.2 Revoke a single server (deny just `jira`, `github`, or `ci`)

Because tokens are **scoped per server**, you can deny one server without touching the others —
useful when only one server is implicated (e.g. a leaked token seen with `mcp/github`).

- **Stop minting that scope:** remove the scope from the confidential client's
  `allowed_oauth_scopes` in Terraform (`TODO(LS-5090)`) and apply. New mints for that scope fail;
  the other two scopes keep working.
- **Reject that scope server-side:** the target Lambda already requires its own scope; to deny it
  immediately without a Cognito change, deploy the affected Lambda with its scope check inverted
  / disabled (`TODO(LS-5090)` — confirm the env-var or flag `mcp-bearer-auth.ts` exposes for
  this once LS-5090/the dedup lands). This denies just that one server within a deploy.
- **Bound:** as in §4.1 step 3, already-minted tokens for that scope stay valid until they expire
  (≤ one minted-token TTL).

> **Per-server scoping is the whole point of OQ-4.** A single scope can be revoked to deny
> exactly one server, leaving the other two reachable — the dual benefit of least privilege
> (contained leak) and surgical revocation (no full outage to contain one server).

---

## 5. Quick reference

| I need to…                          | Go to | One-liner                                                                                     |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| Rotate on schedule (auto)           | §2.1  | Trigger Secrets Manager rotation → refresh local + Copilot → verify.                          |
| Rotate manually                     | §2.2  | Regenerate Cognito client secret → write to Secrets Manager → refresh consumers → retire old. |
| Push a rotated secret to my machine | §2.3  | `node scripts/mcp-auth.mjs --machine` (`TODO(LS-5090)`) → restart session.                    |
| Push a rotated secret to Copilot    | §2.3  | Update the `copilot` environment secret; next task re-mints.                                  |
| Kill the credential entirely        | §4.1  | Delete/regenerate the Cognito confidential client → scrub Secrets Manager.                    |
| Deny just one server                | §4.2  | Drop that `mcp/<server>` scope from the client (or reject it in that Lambda).                 |
| Understand why long-lived is safe   | §3    | Secret stays off the wire (headersHelper); wire tokens are short-lived + per-server scoped.   |

---

## 6. Related

- RFC: [`docs/rfcs/draft-seamless-mcp-auth.md`](../rfcs/draft-seamless-mcp-auth.md) — Track A
  design, AC-A5, GAP-7, OQ-2/OQ-4.
- [`terraform/main/lambda-mcp-api-gateway.tf`](../../terraform/main/lambda-mcp-api-gateway.tf) —
  the existing Cognito pool, public `mcp_cli` client, and SSM publishing pattern LS-5090 extends.
- [`scripts/mcp-auth.mjs`](../../scripts/mcp-auth.mjs) — current interactive token flow; gains a
  headless machine-provisioning path under AC-X2 (`TODO(LS-5090)` / LS-5097 follow-up).
- [`.agents/skills/mcp-diagnostics/SKILL.md`](../../.agents/skills/mcp-diagnostics/SKILL.md) —
  "Mid-Session 401 / Token Expiry" and why a session restart is required after any credential
  change.
- [`.agents/skills/secrets-handling/SKILL.md`](../../.agents/skills/secrets-handling/SKILL.md) —
  never embed raw secret values in tool calls or commits.

> **Maintenance note.** When LS-5090 merges, search this file for `TODO(LS-5090)` and replace
> every marker with the concrete client id, secret ARN, SSM paths, resource-server identifier,
> and minted-token TTL its Terraform publishes; then remove the status banner at the top.

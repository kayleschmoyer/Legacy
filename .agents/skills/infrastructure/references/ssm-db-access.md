# SSM Port-Forward to Dev RDS

The dev RDS instance lives in a private VPC and cannot be reached directly from
developer machines. To run any CLI / Nx target against it (e.g.
`pnpm exec nx run cli:start -- set-user-type ...`), you need an active SSM
port-forward session **and** four env-var overrides on the command itself.

> **Dev only.** Never apply this pattern to the production RDS instance. CLI
> commands that mutate data should always run against dev unless an
> infrastructure operator explicitly authorises a production run via a
> different procedure.

## Prerequisite — SSM session

The user (or an infra operator) must start an SSM port-forward in a separate
terminal that maps the RDS endpoint to `localhost:5432`. Agents do **not**
start this session — ask the user to confirm it is running before attempting
any CLI command.

To detect whether the tunnel is up, check that something is listening on
port 5432:

```bash
# Linux
ss -lnt | grep ':5432'

# macOS
lsof -nP -iTCP:5432 -sTCP:LISTEN

# Git Bash on Windows
netstat -ano | grep ':5432'
```

```powershell
# PowerShell
Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
```

If nothing is listening, stop and tell the user:

> The SSM port-forward to dev RDS is not running on `localhost:5432`. Please
> start the tunnel in a separate terminal, then let me know and I'll retry.

Do not try to start the tunnel yourself — it requires AWS SSO credentials and
the bastion instance ID, both of which belong to the user's session.

## Required host overrides and SSL options

The CLI's default DB config tries to dial the real RDS hostname over TLS with
verified certs. Through the tunnel, the hostname must be `localhost`, so the
host overrides below are required for tunneled access. If the tunneled
connection then fails TLS verification because the cert is for the RDS host,
use the repo's DB-specific SSL knobs rather than disabling Node TLS globally.

| Variable                   | Why                                                                     |
| -------------------------- | ----------------------------------------------------------------------- |
| `DB_HOST=localhost`        | Override the RDS hostname so the driver dials the tunnel.               |
| `DB_HOST_DIRECT=localhost` | Some code paths read `DB_HOST_DIRECT` instead — set both.               |
| `DB_SSL_SELF_SIGNED=true`  | Supported escape hatch to relax DB cert validation for tunneled access. |
| `DB_CERT_PATH=...`         | Preferred when you have a cert bundle the DB client should trust.       |

If you are running `psql` directly (e.g. via `db-cli psql`), use `psql`'s own
SSL settings (`PGSSLMODE=no-verify`) for that command only — `PGSSLMODE` does
not affect the Node DB client.

Missing the host overrides produces one of two failure modes:

- `ENOTFOUND <rds-host>.amazonaws.com` — `DB_HOST` / `DB_HOST_DIRECT` not set,
  driver tried the real RDS hostname instead of the tunnel.
- TLS hostname / certificate validation errors — the driver dialed the tunnel
  but rejected the RDS cert; use `DB_SSL_SELF_SIGNED=true` (or provide
  `DB_CERT_PATH`) instead of setting `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Command template

Set the env vars **on the same command line** as `pnpm exec nx`. Do not
`export` them globally — keep the tunnel-specific DB host and SSL overrides
scoped to the command that needs them.

### Bash / Git Bash

```bash
DB_HOST=localhost \
DB_HOST_DIRECT=localhost \
DB_SSL_SELF_SIGNED=true \
pnpm exec nx run cli:start -- <subcommand> <args>
```

### PowerShell

PowerShell does not support inline env-var prefixing. Set them on the parent
process for the single invocation, then unset:

```powershell
$env:DB_HOST = 'localhost'
$env:DB_HOST_DIRECT = 'localhost'
$env:DB_SSL_SELF_SIGNED = 'true'
try {
  pnpm exec nx run cli:start -- <subcommand> <args>
} finally {
  Remove-Item Env:DB_HOST, Env:DB_HOST_DIRECT, Env:DB_SSL_SELF_SIGNED
}
```

### MCP `nx_run`

`nx_run` accepts an `env` parameter — prefer this over Bash so the agent stays
MCP-first and the variables are scoped to the single tool call:

```
nx_run({
  project: "cli",
  target: "start",
  args: ["--", "set-user-type", "<user-id>", "<type>"],
  env: {
    DB_HOST: "localhost",
    DB_HOST_DIRECT: "localhost",
    DB_SSL_SELF_SIGNED: "true",
  },
})
```

## Verification

After a successful run, the CLI prints normal output (no DNS or TLS errors).
If you see either of the failure modes above, re-check the env vars; if the
output is `ECONNREFUSED localhost:5432`, the tunnel itself is down — go back
to the SSM session step.

## Why this is not a default

The CLI does not default to `localhost` because the same code path runs from
Lambda, where the RDS hostname **is** the correct target. We deliberately
require explicit overrides so accidental local runs against prod RDS fail loud
instead of silently dialing the wrong host.

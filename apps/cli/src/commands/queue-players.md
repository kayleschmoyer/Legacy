# NFL Player Import (`queue-players`)

Discovers NFL players by scraping the Pro Football Reference A–Z index, upserts
them into the DB, and (optionally) enqueues stats-load jobs to SQS. Baseball
reads existing players from the DB instead of scraping; this doc focuses on
the football path, which requires extra local setup.

## Command

```powershell
pnpm --filter @legacy-sports/cli exec tsx --tsconfig ../../tsconfig.base.json src/main.ts queue-players --sport football --skip-queue
```

**Options:**

- `--sport <sport>` (required): `baseball` or `football`.
- `--skip-queue`: upserts players into the DB without dispatching SQS
  stats-load jobs. Omit it to also enqueue stats loads.
- `--letter <A-Z>`: process only players whose ID starts with this letter —
  useful for resuming a partial run or testing against a small slice.

Queue URLs are read from env, not hardcoded — see `.env` / `.env.example`.

## Prerequisites for running locally against dev

Running this command against the dev database from a local machine requires
three things to be true at once: a Cloudflare bypass for PFR, a tunnel to dev
RDS, and DB credentials configured for the tunnel.

### 1. PFR Cloudflare bypass

Pro Football Reference sits behind Cloudflare. From a non-allowlisted network
(e.g. local dev), scraping requires a valid `cf_clearance` cookie plus the
_exact_ matching browser User-Agent, both pulled from the same browser
DevTools session against pro-football-reference.com:

```powershell
$env:PFR_CF_CLEARANCE="<cfclearance cookie value>"
$env:PFR_USER_AGENT="<matching browser User-Agent>"
```

See [`lib/pfr-client/src/lib/PFRSession.ts`](../../../../lib/pfr-client/src/lib/PFRSession.ts).
When unset, no auth headers are added and PFR requests will fail from an
unallowed network.

**The `cf_clearance` cookie is short-lived (~30 min observed).** Re-pull it
from DevTools if the scrape starts failing partway through a run — use
`--letter` to resume from where it stopped.

### 2. DB tunnel to dev RDS

`make db-tunnel` requires bash (WSL/Git Bash/Linux) — on Windows/PowerShell
it prints a "run in WSL/Git Bash/Linux" message and exits. PowerShell users
must open the SSM port-forward manually:

```powershell
aws ssm start-session --region us-east-1 `
  --target <current-NAT-instance-id> `
  --document-name AWS-StartPortForwardingSessionToRemoteHost `
  --parameters '{"host":["legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5432"]}'
```

Confirm the current NAT instance ID first — it has rotated multiple times
historically:

```powershell
aws ssm describe-instance-information --region us-east-1
```

**The local tunnel port must be 5432, not an alternate port like 15432.**
[`PgDbConnection`](../../../../lib/db-client/src/lib/client/abstract/PgDbConnection.ts)
hardcodes `port: 5432` for the pool connection, ignoring the resolved DB
config's port — see [Known issues](#known-issues-not-fixed-here) below.

### 3. Local credential override

With `USE_LOCAL_CREDENTIALS=true`, SSL is skipped by
[`getDatabaseConfig`](../../../../lib/db-client/src/config/database.ts) unless
`DB_SSL_SELF_SIGNED=true` is also set — and dev RDS requires SSL. Set this
full override set before running the command:

```powershell
$env:USE_LOCAL_CREDENTIALS="true"
$env:DB_SECRET_NAME=""
$env:DB_CREDS_PATH=""
$env:DB_HOST="127.0.0.1"
$env:DB_USER="postgres"
$env:DB_SSL_SELF_SIGNED="true"
$env:DB_CERT_PATH=""
```

### 4. `DB_PASSWORD`

Run the sync script pointed at the actual Terraform config directory, then
read `DB_PASSWORD` straight from `.env`:

```powershell
.\scripts\sync-env.ps1 -TerraformDir "terraform\main"
```

`scripts/sync-env.ps1` defaults `-TerraformDir` to `terraform`, which does not
match where the `.tf` files actually live (`terraform/main`) — always pass
`-TerraformDir "terraform\main"` explicitly. Do **not** parse `DB_PASSWORD`
out of `DATABASE_URL` — that was only a workaround for a broken sync run
caused by the same `-TerraformDir` mismatch, and is no longer needed once the
correct directory is passed.

## Known issues (not fixed here)

These are pre-existing gaps worth knowing about when this workflow misbehaves
— none are in scope for this doc:

- `PgDbConnection` hardcodes `port: 5432`, ignoring `dbConfig.port` — breaks
  non-standard tunnel ports (must use local port 5432, see above).
- `sync-env.ps1` silently reports `[OK] Database credentials retrieved` and
  "Updated DB_PASSWORD" even when the underlying
  `aws secretsmanager get-secret-value` call fails (e.g. from an empty
  `--secret-id` produced by a failed `terraform output`) — it should fail
  loudly instead of writing an empty password.
- `sync-env.ps1`'s default `-TerraformDir "terraform"` doesn't match where
  the actual Terraform config lives (`terraform/main`) — it should default
  there, or clearly document the mismatch.

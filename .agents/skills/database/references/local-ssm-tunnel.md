# Reaching the dev RDS from a local machine (SSM tunnel + `DB_TUNNEL`)

Agents use the hosted DB MCP server (`db_query` / `db_execute` / `db_migrate`), which needs no tunnel. This page is for **maintainers** running `lib/db-client` scripts or `ls-cli.sh` commands that use Secrets Manager credentials against the private dev RDS, for example `db:resync-role`, `seed-football-players --apply` or `derive-football-season-stats --apply`.

The secret's `host` is the private RDS endpoint, and it takes precedence over `DB_HOST`. Without a tunnel the connection times out (`connect ETIMEDOUT 10.0.x.x:5432`). Set **`DB_TUNNEL=host:port`** to send the TCP connection through a local port-forward. TLS is still verified against the RDS hostname from the secret, so no hosts-file edit and no `DB_SSL_SELF_SIGNED` are needed (LS-10609). `DB_TUNNEL` is ignored inside Lambda.

## PowerShell

Prerequisite: the AWS Session Manager plugin (`winget install --id Amazon.SessionManagerPlugin -e`, then open a new terminal).

Window 1, the tunnel (leave it running):

```powershell
$rdsHost = aws rds describe-db-instances --region us-east-1 `
  --query "DBInstances[?starts_with(DBInstanceIdentifier,'legacy-sports-dev')].Endpoint.Address | [0]" --output text
$target = aws ssm describe-instance-information --region us-east-1 `
  --query "InstanceInformationList[?PingStatus=='Online'].InstanceId | [0]" --output text
# Use AWS CLI shorthand: Windows PowerShell 5.1 strips the quotes from inline JSON.
aws ssm start-session --region us-east-1 --target $target `
  --document-name AWS-StartPortForwardingSessionToRemoteHost `
  --parameters "host=$rdsHost,portNumber=5432,localPortNumber=5432"
```

Window 2, the command:

```powershell
$env:DB_TUNNEL = "localhost:5432"
pnpm --prefix lib/db-client run db:resync-role -- --role corpus_ingest_readonly --secret-name "<secret name>"
```

## bash

```bash
DB_TUNNEL_TARGET=<instance id> DB_TUNNEL_HOST=<rds endpoint> make db-tunnel   # leave running
DB_TUNNEL=localhost:5432 pnpm --prefix lib/db-client run db:status
```

Notes:

- Port 5432 must be free locally (stop any local Postgres or Docker DB first), or pick another `localPortNumber` and match it in `DB_TUNNEL`.
- If `describe-instance-information` returns `None`, no SSM-managed instance in the VPC is online to tunnel through (the self-hosted runners are spot instances and can scale to zero).

# Promote User to Admin

Grant a user `admin` access in the app. The `access_level` column on `app_internal.users` is a Postgres enum: `'none' | 'admin'`.

## When to use

A user needs admin access to the Legacy Sports app (e.g. internal team member, support escalation). The script reads `DATABASE_URL` from `.env` to determine which environment to target — point it at the correct `.env` before running.

## Prerequisites

- AWS SSO authenticated (`aws sts get-caller-identity` returns your identity)
- `aws` CLI installed and on PATH
- `node` ≥ 18 available
- Repo checked out with `.env` present at the root (contains `DATABASE_URL`)

## Steps

### 1. Write the script

Copy the script below into `scratch/promote-user-to-admin.mjs` in the repo root:

```js
#!/usr/bin/env node
// scratch/promote-user-to-admin.mjs
// Usage: node scratch/promote-user-to-admin.mjs <email> [none|admin]
//
// Standalone oncall script — runs with plain `node`, outside the monorepo build
// system. console.* is intentional: @legacy-sports/logging requires the full
// Lambda/app initialisation stack and is not appropriate here.
//
// Discovers the NAT instance, opens an SSM port-forward tunnel to RDS,
// updates the user's access_level, verifies the change, then tears down the tunnel.

import { execFile, spawn } from 'node:child_process';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const email = process.argv[2];
const accessLevel = process.argv[3] ?? 'admin';

if (!email || !['none', 'admin'].includes(accessLevel)) {
  console.error(
    'Usage: node scratch/promote-user-to-admin.mjs <email> [none|admin]',
  );
  process.exit(1);
}

const LOCAL_PORT = 15433;
// Read region from environment; the entire project infrastructure lives in us-east-1
// but this allows overriding for future multi-region deployments.
const AWS_REGION = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

function parseEnv() {
  const envPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '.env',
  );
  const contents = readFileSync(envPath, 'utf8');
  const match = contents.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error('DATABASE_URL not found in .env');
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function getNatInstanceId() {
  return new Promise((resolve, reject) => {
    execFile(
      'aws',
      [
        'ec2',
        'describe-instances',
        '--region',
        AWS_REGION,
        '--filters',
        'Name=tag:Name,Values=*-nat-instance',
        'Name=instance-state-name,Values=running',
        '--query',
        'Reservations[0].Instances[0].InstanceId',
        '--output',
        'text',
      ],
      (err, stdout) => {
        if (err) return reject(err);
        const id = stdout.trim();
        if (!id || id === 'None')
          return reject(new Error('No running NAT instance found'));
        resolve(id);
      },
    );
  });
}

function waitForPort(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() >= deadline)
          return reject(new Error(`Timed out waiting for localhost:${port}`));
        setTimeout(attempt, 500);
      });
    }
    attempt();
  });
}

async function main() {
  // Parse DATABASE_URL first so the tunnel targets the correct environment
  const dbUrl = parseEnv();
  const url = new URL(dbUrl);
  const dbHost = url.hostname;

  console.log('Discovering NAT instance...');
  const natInstanceId = await getNatInstanceId();
  console.log(`NAT instance: ${natInstanceId}`);

  console.log(`Opening SSM tunnel → localhost:${LOCAL_PORT} → ${dbHost}...`);
  const tunnel = spawn(
    'aws',
    [
      'ssm',
      'start-session',
      '--region',
      AWS_REGION,
      '--target',
      natInstanceId,
      '--document-name',
      'AWS-StartPortForwardingSessionToRemoteHost',
      '--parameters',
      JSON.stringify({
        host: [dbHost],
        portNumber: ['5432'],
        localPortNumber: [String(LOCAL_PORT)],
      }),
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  tunnel.on('error', (err) => {
    console.error('Tunnel error:', err);
    process.exit(1);
  });

  try {
    await waitForPort(LOCAL_PORT);
    console.log('Tunnel ready.');

    const { default: postgres } = await import('postgres');
    const sql = postgres({
      host: '127.0.0.1',
      port: LOCAL_PORT,
      database: url.pathname.slice(1),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      // rejectUnauthorized: false is required for tunneled connections — the TCP
      // connection is to 127.0.0.1:15433 so the RDS certificate hostname won't
      // match '127.0.0.1'. The SSM session already provides transport encryption.
      ssl: { rejectUnauthorized: false },
      max: 1,
    });

    console.log(`Setting access_level = '${accessLevel}' for ${email}...`);
    const rows = await sql`
      UPDATE app_internal.users
         SET access_level = ${accessLevel}
       WHERE email = ${email}
      RETURNING id, email, access_level
    `;

    if (rows.length === 0) {
      console.error(`No user found with email: ${email}`);
      await sql.end();
      process.exit(1);
    }

    console.log('Updated:', rows[0]);

    const verify = await sql`
      SELECT id, email, access_level
        FROM app_internal.users
       WHERE email = ${email}
    `;
    console.log('Verified:', verify[0]);

    await sql.end();
  } finally {
    tunnel.kill();
    console.log('Tunnel closed.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### 2. Run the script

From the repo root:

```bash
node scratch/promote-user-to-admin.mjs user@example.com
```

Expected output:

```
Discovering NAT instance...
NAT instance: i-0abc123...
Opening SSM tunnel → localhost:15433 → legacy-sports-dev-postgres.cep4b6aynyet.us-east-1.rds.amazonaws.com...
Tunnel ready.
Setting access_level = 'admin' for user@example.com...
Updated: { id: 42, email: 'user@example.com', access_level: 'admin' }
Verified: { id: 42, email: 'user@example.com', access_level: 'admin' }
Tunnel closed.
```

### 3. Verify

If you want to run a standalone verification query, open a second terminal, start a tunnel manually, then connect with `psql` or any Postgres client pointed at `localhost:15433`:

```sql
SELECT id, email, access_level
  FROM app_internal.users
 WHERE email = 'user@example.com';
```

`access_level` should be `admin`.

## Known limitations

### CLI command does not work through the tunnel

There is a CLI command intended for this operation:

```bash
pnpm exec nx run cli:start --args="set-user-type --email <email> --type admin"
```

Source: [`apps/cli/src/commands/setUserType.ts`](../../apps/cli/src/commands/setUserType.ts)

It currently fails when connecting through a tunnel due to two bugs:

1. **Port hardcoded to 5432** — `lib/db-client/src/lib/client/abstract/PgDbConnection.ts` ignores `dbConfig.port` and always connects on port 5432. Setting `DB_HOST=localhost:15433` has no effect.

2. **Secret host takes precedence** — `lib/db-client/src/config/credentials.ts` resolves the DB host from the AWS Secrets Manager secret value first, overriding any `DB_HOST` env var.

A follow-up ticket should fix these so the CLI command works through the tunnel without a custom script.

## Rollback

Run the same script with `none` as the second argument:

```bash
node scratch/promote-user-to-admin.mjs user@example.com none
```

This sets `access_level = 'none'`, revoking admin access.

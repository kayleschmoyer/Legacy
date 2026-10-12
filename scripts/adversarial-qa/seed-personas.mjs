#!/usr/bin/env node
// Seeds the reserved-id persona users this harness forges tokens for, plus
// one scratch league owned by `owner` with `outsider` joined as an ordinary
// team manager. Safe to re-run (idempotent upserts). Writes to
// app_internal.users directly — the public.users VIEW used by resolvers is
// not insertable (see users.ts / the public schema's view definition).

import { execFileSync } from 'node:child_process';
import { assertLocalTarget, PERSONA_ID_BASE } from './lib/stack.mjs';

assertLocalTarget();

const DB_ENV = {
  ...process.env,
  PGPASSWORD: process.env.DB_PASSWORD ?? 'legacy_sports_dev',
};

function psql(sql) {
  return execFileSync(
    'psql',
    [
      '-h',
      'localhost',
      '-U',
      process.env.DB_USER ?? 'legacy_sports',
      '-d',
      process.env.DB_NAME ?? 'legacy_sports_dev',
      '-tA',
      '-c',
      sql,
    ],
    { env: DB_ENV, encoding: 'utf8' },
  );
}

const personas = [
  {
    id: PERSONA_ID_BASE,
    email: 'aqa_owner@adversarial.test',
    username: 'aqa_owner',
    level: 'none',
  },
  {
    id: PERSONA_ID_BASE + 1,
    email: 'aqa_outsider@adversarial.test',
    username: 'aqa_outsider',
    level: 'none',
  },
  {
    id: PERSONA_ID_BASE + 2,
    email: 'aqa_nonmember@adversarial.test',
    username: 'aqa_nonmember',
    level: 'none',
  },
  {
    id: PERSONA_ID_BASE + 3,
    email: 'aqa_admin@adversarial.test',
    username: 'aqa_admin',
    level: 'admin',
  },
];

for (const p of personas) {
  psql(
    `insert into app_internal.users (id, canonical_email, username, access_level, subscription_tier, entitlements_updated_at)
     values (${p.id}, '${p.email}', '${p.username}', '${p.level}', 'free', to_timestamp(0))
     on conflict (id) do update set entitlements_updated_at = to_timestamp(0)`,
  );
}

console.log(
  `Seeded ${personas.length} personas (ids ${PERSONA_ID_BASE}-${PERSONA_ID_BASE + personas.length - 1}).`,
);

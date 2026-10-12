// Safety-gated helpers for the adversarial-qa harness.
//
// This harness talks to lambdas/db/src/dev.ts, the local standalone Apollo
// server. That server decodes a JWT's payload without verifying its
// signature (it is a dev convenience — see dev.ts's context function) and
// falls back to an admin user when no Authorization header is sent. That is
// exactly what makes persona-impersonation possible here, and exactly why
// this must never be pointed at anything but a local throwaway database:
// the real server (lambdas/db/src/server/apollo.ts + context.ts) verifies
// JWT signatures and would reject every forged token this harness mints.
//
// `assertLocalTarget` is the one guard standing between "safe sandbox tool"
// and "forged-admin-token generator pointed at a real database." Every
// script in this directory must call it before touching the DB or the API.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertLocalTarget() {
  const dbHost = process.env.DB_HOST ?? '';
  const dbUrl = process.env.DATABASE_URL ?? '';
  const graphqlUrl =
    process.env.ADVERSARIAL_QA_GRAPHQL_URL ?? 'http://localhost:5000/';

  const hostOk = LOCAL_HOSTS.has(dbHost.split(':')[0]);
  const urlOk = LOCAL_HOSTS.has(
    new URL(dbUrl || 'postgresql://x@localhost/x').hostname,
  );
  const graphqlOk = LOCAL_HOSTS.has(new URL(graphqlUrl).hostname);

  if (!hostOk || !urlOk || !graphqlOk) {
    throw new Error(
      'adversarial-qa refuses to run: DB_HOST/DATABASE_URL/ADVERSARIAL_QA_GRAPHQL_URL ' +
        'must all point at localhost. This harness forges unsigned JWTs that only the ' +
        'local dev server (lambdas/db/src/dev.ts) accepts — never run it against a ' +
        'shared, staging, or production target.',
    );
  }
}

/** Reserved persona id range — never overlaps real seeded/production ids. */
export const PERSONA_ID_BASE = 900001;

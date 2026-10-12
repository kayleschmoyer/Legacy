import { assertLocalTarget, PERSONA_ID_BASE } from './stack.mjs';

assertLocalTarget();

const GRAPHQL_URL =
  process.env.ADVERSARIAL_QA_GRAPHQL_URL ?? 'http://localhost:5000/';

/**
 * Personas available to every scenario. Ids are in the reserved
 * PERSONA_ID_BASE.. range so they never collide with real data — see
 * seed-personas.mjs, which must be run once before any scenario.
 */
export const PERSONAS = {
  owner: {
    id: PERSONA_ID_BASE,
    username: 'aqa_owner',
    email: 'aqa_owner@adversarial.test',
  },
  outsider: {
    id: PERSONA_ID_BASE + 1,
    username: 'aqa_outsider',
    email: 'aqa_outsider@adversarial.test',
  },
  nonMember: {
    id: PERSONA_ID_BASE + 2,
    username: 'aqa_nonmember',
    email: 'aqa_nonmember@adversarial.test',
  },
  admin: {
    id: PERSONA_ID_BASE + 3,
    username: 'aqa_admin',
    email: 'aqa_admin@adversarial.test',
    isAdmin: true,
  },
};

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/**
 * Mints an unsigned JWT the dev server will decode as the given persona.
 * `iat` is set to "now" so it is never older than the persona's
 * entitlements_updated_at marker (seed-personas.mjs sets that to epoch) —
 * otherwise every call fails fast with ENTITLEMENTS_STALE before a
 * scenario gets to run.
 */
export function mintToken(persona) {
  const header = base64url({ alg: 'none' });
  const payload = base64url({ ...persona, iat: Math.floor(Date.now() / 1000) });
  return `${header}.${payload}.unsigned`;
}

/** Sends one GraphQL request as `personaKey` (a key of PERSONAS). */
export async function gql(personaKey, query, variables) {
  const persona = PERSONAS[personaKey];
  if (!persona) throw new Error(`Unknown persona "${personaKey}"`);
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${mintToken(persona)}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

/** Sends two requests back-to-back with no await between dispatch — for race scenarios. */
export async function gqlRace(personaKey, query, variables, count = 2) {
  const persona = PERSONAS[personaKey];
  if (!persona) throw new Error(`Unknown persona "${personaKey}"`);
  const token = mintToken(persona);
  const send = () =>
    fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    }).then((r) => r.json());
  return Promise.all(Array.from({ length: count }, send));
}

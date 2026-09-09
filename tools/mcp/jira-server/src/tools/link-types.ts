import { jiraRequest } from '../jira-api.js';

export interface JiraLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

interface IssueLinkTypesResponse {
  issueLinkTypes: JiraLinkType[];
}

/**
 * Common human-readable phrases mapped to a normalized substring that
 * identifies the intended link type when it doesn't literally match any
 * name/inward/outward phrase returned by the instance (e.g. "is caused by"
 * has no exact counterpart — the instance's type is named "Cause").
 */
const ALIASES: Record<string, string> = {
  'is caused by': 'cause',
  causes: 'cause',
  'caused by': 'cause',
  blocks: 'block',
  'blocked by': 'block',
  'is blocked by': 'block',
  'relates to': 'relate',
  related: 'relate',
  duplicates: 'duplicate',
  'duplicated by': 'duplicate',
  'is duplicated by': 'duplicate',
  clones: 'clone',
  'cloned by': 'clone',
  'is cloned by': 'clone',
};

let cachedTypes: JiraLinkType[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Fetch the connected Jira instance's issue link types, with a short-lived cache. */
export async function fetchLinkTypes(): Promise<JiraLinkType[]> {
  const now = Date.now();
  if (cachedTypes && now < cacheExpiresAt) {
    return cachedTypes;
  }
  const response = await jiraRequest<IssueLinkTypesResponse>({
    method: 'GET',
    path: '/rest/api/3/issueLinkType',
  });
  cachedTypes = response.issueLinkTypes;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedTypes;
}

/** Test-only: clear the module-level cache so specs don't leak state across cases. */
export function __resetLinkTypeCacheForTests(): void {
  cachedTypes = null;
  cacheExpiresAt = 0;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');
}

/** Levenshtein edit distance, used for the fuzzy-match fallback. */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export interface LinkTypeResolution {
  resolved: string | null;
  /** Closest known type name, offered as a "did you mean" hint when unresolved. */
  suggestion: string | null;
  availableNames: string[];
}

/**
 * Resolve a caller-supplied link type string (possibly wrong case, a
 * human phrase, or an inward/outward phrase instead of a name) to the
 * canonical type `name` Jira's REST API expects.
 *
 * Match order: exact name/inward/outward (case-insensitive) → alias table
 * → fuzzy (edit-distance) match against known names. Returns `resolved:
 * null` when nothing clears the fuzzy threshold, along with the closest
 * suggestion and the full list of valid names for a helpful error.
 */
export function resolveLinkType(
  requested: string,
  types: JiraLinkType[],
): LinkTypeResolution {
  const availableNames = types.map((t) => t.name);
  const requestedNorm = normalize(requested);

  for (const t of types) {
    if (
      normalize(t.name) === requestedNorm ||
      normalize(t.inward) === requestedNorm ||
      normalize(t.outward) === requestedNorm
    ) {
      return { resolved: t.name, suggestion: null, availableNames };
    }
  }

  const aliasTarget = ALIASES[requested.toLowerCase().trim()];
  if (aliasTarget) {
    const aliasMatch = types.find(
      (t) =>
        normalize(t.name).includes(aliasTarget) ||
        normalize(t.inward).includes(aliasTarget) ||
        normalize(t.outward).includes(aliasTarget),
    );
    if (aliasMatch) {
      return { resolved: aliasMatch.name, suggestion: null, availableNames };
    }
  }

  let best: { name: string; distance: number } | null = null;
  for (const t of types) {
    const distance = levenshtein(requestedNorm, normalize(t.name));
    if (best === null || distance < best.distance) {
      best = { name: t.name, distance };
    }
  }

  const threshold = Math.max(1, Math.floor(requestedNorm.length * 0.3));
  if (best && best.distance <= threshold) {
    return { resolved: best.name, suggestion: null, availableNames };
  }

  return {
    resolved: null,
    suggestion: best?.name ?? null,
    availableNames,
  };
}

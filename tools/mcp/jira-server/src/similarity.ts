import { searchJqlAll } from './jql-search.js';
import { matchesStatus } from './locale.js';

/**
 * Claim-time duplicate-*ticket* guard (LS-9567). Complements the existing
 * duplicate-*agent* guard in claim-ticket.ts (LS-9289's caller-supplied
 * `openPrs`), which only catches two sessions colliding on the same ticket
 * key. This catches the structurally different case where one bug produced
 * several differently-keyed tickets (LS-9545/9547/9550): no key-based lookup
 * can ever see that, because each ticket's own key search never surfaces
 * another ticket's key.
 *
 * Naive token-overlap on the summary alone is deliberately the whole
 * algorithm — no NLP, no external service. Prototyped against the real
 * LS-9545/9547/9550 trio: pairwise summary-only Jaccard scores are
 * 0.33 / 0.39 / 0.44, while unrelated tickets scored 0.00 / 0.04. A single
 * JQL round-trip (summary + status only) keeps this cheap enough to run on
 * every claim (AC3).
 */

/** Short/common words that add noise without discriminating between tickets. */
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'her',
  'was',
  'one',
  'our',
  'out',
  'day',
  'get',
  'has',
  'him',
  'his',
  'how',
  'man',
  'new',
  'now',
  'old',
  'see',
  'two',
  'way',
  'who',
  'boy',
  'did',
  'its',
  'let',
  'put',
  'say',
  'she',
  'too',
  'use',
  'with',
  'from',
  'that',
  'this',
  'then',
  'than',
  'have',
  'been',
  'into',
  'when',
  'after',
  'while',
  'also',
  'they',
  'their',
  'were',
  'main',
  'app',
]);

/** Below this score, two summaries are treated as unrelated. */
export const SIMILARITY_THRESHOLD = 0.3;

/** How far back to look for candidate duplicates by default. */
export const DEFAULT_LOOKBACK_HOURS = 168;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/** Jaccard similarity: |intersection| / |union|, in [0, 1]. */
export function summarySimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarTicketCandidate {
  key: string;
  summary: string;
  status: string;
  score: number;
}

interface FindSimilarTicketsParams {
  /** Key of the ticket being claimed — excluded from its own candidate search. */
  key: string;
  summary: string;
  /** Jira project key, e.g. "LS", derived from `key`'s prefix. */
  projectKey: string;
  /** How far back (in hours) to search for candidate duplicates. */
  lookbackHours?: number;
}

/**
 * Search for recently-created, still-open tickets in the same project whose
 * summary significantly overlaps the given ticket's summary. Returns matches
 * at or above SIMILARITY_THRESHOLD, sorted highest-score first.
 */
export async function findSimilarTickets(
  params: FindSimilarTicketsParams,
): Promise<SimilarTicketCandidate[]> {
  const {
    key,
    summary,
    projectKey,
    lookbackHours = DEFAULT_LOOKBACK_HOURS,
  } = params;

  if (tokenize(summary).size === 0) return [];

  const candidates = await searchJqlAll<{
    summary: string;
    status: { name: string };
  }>({
    jql:
      `project = ${JSON.stringify(projectKey)} AND key != ${JSON.stringify(key)} ` +
      `AND status not in ("Done", "Won't Do") AND created >= "-${lookbackHours}h"`,
    fields: ['summary', 'status'],
    maxResults: 50,
  });

  const scored: SimilarTicketCandidate[] = [];
  for (const candidate of candidates) {
    // Never flag a ticket against itself or an already-terminal status —
    // the JQL filter above should already exclude these, but a defensive
    // second check costs nothing and survives a JQL-filter regression.
    if (candidate.key === key) continue;
    if (
      matchesStatus(candidate.fields.status.name, 'Done') ||
      matchesStatus(candidate.fields.status.name, "Won't Do")
    ) {
      continue;
    }

    const score = summarySimilarity(summary, candidate.fields.summary);
    if (score >= SIMILARITY_THRESHOLD) {
      scored.push({
        key: candidate.key,
        summary: candidate.fields.summary,
        status: candidate.fields.status.name,
        score,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

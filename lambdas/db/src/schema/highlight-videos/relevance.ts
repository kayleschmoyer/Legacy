/**
 * Title validation for the highlight-video resolver (LS-9113).
 *
 * The spike (LS-9111) measured a 40% wrong-player rate on raw MLB-channel
 * search hits — surname collisions onto modern players (Bill Byrd → Marlon
 * Byrd, Rip Russell → Addison Russell). Validation before caching is the
 * load-bearing requirement:
 *
 *  - Full "First Last" in the normalized title, with the player as the
 *    title's subject → auto-accept.
 *  - Full-name match where the player is likely not the subject (LS-10819:
 *    "AL CY YOUNG AWARD WINNER Tarik Skubal", "Max Scherzer ... passed the
 *    LEGENDARY Walter Johnson") → routed through the relevance judge.
 *  - Last-name-only match (archival titles like "1952WS GM7: Mize gives
 *    Yankees lead") → only accepted when the relevance judge confirms the
 *    title fits the player's era/team; otherwise the player is marked
 *    unresolved and the splash uses the LS-9095 graphic tier.
 *
 * The judge is a Cloudflare Workers AI text model — the house AI-judge
 * precedent (lambdas/image-upload/src/cloudflare.ts) with the same
 * deterministic post-filter principle: anything other than an unambiguous
 * YES fails closed to "not relevant".
 */

import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';

// ─── Title normalization + matching ─────────────────────────────────────────

/**
 * Normalize a title or name for matching: lowercase, diacritics stripped,
 * punctuation collapsed to spaces. (Node-side only — String.prototype
 * .normalize is safe here; never move this into shared-components, Hermes
 * lacks it.)
 */
export function normalizeForTitleMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type TitleMatch =
  | 'full_name'
  | 'full_name_ambiguous'
  | 'last_name'
  | 'none';

/**
 * Players whose full name is also an MLB award name — on the MLB channel a
 * "Cy Young" title is almost always about the award, so these hits always
 * go to the judge.
 */
const AWARD_NAMESAKES = new Set([
  'cy young',
  'hank aaron',
  'roberto clemente',
  'jackie robinson',
  'willie mays',
  'ted williams',
  'lou gehrig',
  'mariano rivera',
  'trevor hoffman',
  'edgar martinez',
]);

/**
 * Words shortly before the name that make the player the object of the
 * title rather than its subject ("passed the LEGENDARY Walter Johnson",
 * "first since Babe Ruth").
 */
const OBJECT_CUES_BEFORE = new Set([
  'pass',
  'passed',
  'passes',
  'passing',
  'surpass',
  'surpassed',
  'surpasses',
  'surpassing',
  'overtake',
  'overtakes',
  'overtook',
  'tie',
  'ties',
  'tied',
  'tying',
  'join',
  'joins',
  'joined',
  'joining',
  'than',
  'since',
  'like',
]);
/** How many tokens before the name are checked for object cues. */
const OBJECT_CUE_WINDOW = 3;

/**
 * Words right after the name (or its possessive) that mark it as an award
 * or a record rather than the player ("Cy Young Award", "Babe Ruth's record").
 */
const NON_SUBJECT_CUES_AFTER = new Set([
  'award',
  'awards',
  'winner',
  'winners',
  'race',
  'vote',
  'voting',
  'finalist',
  'finalists',
  'trophy',
  'record',
  'records',
]);

/** Start indexes of every whole-word occurrence of `phrase` in `tokens`. */
function phraseIndexes(tokens: string[], phrase: string[]): number[] {
  const indexes: number[] = [];
  if (phrase.length === 0) return indexes;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((word, k) => tokens[i + k] === word)) indexes.push(i);
  }
  return indexes;
}

/** True when the name occurrence at `start` reads as the title's subject. */
function isSubjectOccurrence(
  tokens: string[],
  start: number,
  nameLength: number,
): boolean {
  const before = tokens.slice(Math.max(0, start - OBJECT_CUE_WINDOW), start);
  if (before.some((word) => OBJECT_CUES_BEFORE.has(word))) return false;
  let next = start + nameLength;
  // Skip the possessive normalization leaves behind ("ruth s record").
  if (tokens[next] === 's') next++;
  const after = tokens[next];
  return after === undefined || !NON_SUBJECT_CUES_AFTER.has(after);
}

/**
 * Classify how strongly a video title matches a player's name. A full-name
 * hit is only 'full_name' (auto-accept) when the player reads as the
 * title's subject; otherwise it is 'full_name_ambiguous' and must pass the
 * judge.
 */
export function matchTitle(
  title: string,
  firstName: string,
  lastName: string,
): TitleMatch {
  const tokens = normalizeForTitleMatch(title).split(' ');
  const fullName = normalizeForTitleMatch(`${firstName} ${lastName}`);
  const nameTokens = fullName === '' ? [] : fullName.split(' ');
  const fullNameHits = phraseIndexes(tokens, nameTokens);
  if (fullNameHits.length > 0) {
    if (AWARD_NAMESAKES.has(fullName)) return 'full_name_ambiguous';
    return fullNameHits.some((start) =>
      isSubjectOccurrence(tokens, start, nameTokens.length),
    )
      ? 'full_name'
      : 'full_name_ambiguous';
  }
  const last = normalizeForTitleMatch(lastName);
  if (last !== '' && phraseIndexes(tokens, last.split(' ')).length > 0) {
    return 'last_name';
  }
  return 'none';
}

// ─── Relevance judge (Cloudflare Workers AI) ────────────────────────────────

/** Small instruct model — a one-token YES/NO classification task. */
const JUDGE_MODEL = '@cf/meta/llama-3.1-8b-instruct';

let cfTokenPromise: Promise<string> | null = null;

// Env is read lazily (not at module scope) so cold-start ordering and tests
// see current values. CLOUDFLARE_AI_API_TOKEN: local dev.
// CLOUDFLARE_AI_TOKEN_PATH: Secrets Manager secret name, production (same
// pair the image-upload lambda uses).
async function getCloudflareToken(): Promise<string> {
  const localToken = process.env['CLOUDFLARE_AI_API_TOKEN'] ?? '';
  if (localToken) return localToken;
  const tokenPath = process.env['CLOUDFLARE_AI_TOKEN_PATH'] ?? '';
  if (!tokenPath) {
    throw new Error(
      'Either CLOUDFLARE_AI_API_TOKEN (local dev) or CLOUDFLARE_AI_TOKEN_PATH (production) must be set',
    );
  }
  if (!cfTokenPromise) {
    cfTokenPromise = retrieveSecretParameterValue(tokenPath).catch((err) => {
      cfTokenPromise = null;
      throw err;
    });
  }
  return cfTokenPromise;
}

export interface RelevanceJudgeInput {
  videoTitle: string;
  playerName: string;
  /** First/last seasons the player appeared in — era context. */
  firstSeason: number | null;
  lastSeason: number | null;
  /** Current MLB team abbreviation, when known (modern players only). */
  mlbTeam: string | null;
}

interface CfChatResponse {
  success: boolean;
  result?: { response?: string };
  errors?: { message: string }[];
}

/**
 * Judge whether an ambiguous title match (last-name-only, or a full-name hit
 * where the player may not be the subject) really is about this player.
 * Fail-closed: any API failure, parse ambiguity, or non-YES answer returns
 * false and the player stays unresolved (graphic fallback).
 */
export async function judgeRelevance(
  input: RelevanceJudgeInput,
): Promise<boolean> {
  try {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '';
    if (!accountId) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable must be set');
    }
    const apiToken = await getCloudflareToken();
    const era =
      input.firstSeason != null && input.lastSeason != null
        ? `${input.firstSeason}–${input.lastSeason}`
        : 'unknown';
    const team = input.mlbTeam ?? 'unknown';
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${JUDGE_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You judge whether an MLB YouTube video title is about a specific ' +
                'baseball player. Video titles that share only a surname with the ' +
                'player often belong to a different, more recent player — when the ' +
                "title's game era, teams, or first name do not fit the player, the " +
                'answer is NO. The player must be the subject of the video: a ' +
                'title that only mentions the player — another player passing ' +
                'their record, or an award named after them such as the Cy Young ' +
                'Award — is NO. Answer with exactly YES or NO.',
            },
            {
              role: 'user',
              content:
                `Player: ${input.playerName} (career seasons ${era}, team ${team}).\n` +
                `Video title: ${input.videoTitle}\n` +
                'Is this video about this specific player? Answer YES or NO.',
            },
          ],
          max_tokens: 5,
          temperature: 0,
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Cloudflare AI returned ${response.status}: ${body}`);
    }
    const data = (await response.json()) as CfChatResponse;
    if (!data.success) {
      throw new Error(
        `Cloudflare AI judge failed: ${
          data.errors?.map((e) => e.message).join(', ') ?? 'unknown error'
        }`,
      );
    }
    const answer = (data.result?.response ?? '').trim();
    const relevant = /^yes\b/i.test(answer);
    LOGGER.debug('[highlight-videos] relevance judge verdict', {
      playerName: input.playerName,
      videoTitle: input.videoTitle,
      answer,
      relevant,
    });
    return relevant;
  } catch (err) {
    // Fail closed — an unjudgeable match is treated as wrong-player and the
    // splash uses the graphic tier instead.
    LOGGER.warn('[highlight-videos] relevance judge unavailable — rejecting', {
      playerName: input.playerName,
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

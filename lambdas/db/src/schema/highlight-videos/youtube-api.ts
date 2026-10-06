/**
 * YouTube Data API v3 client for the highlight-video resolver (LS-9113).
 *
 * Two endpoints only:
 *  - search.list restricted to MLB's official channel — the quota-scarce call
 *    (100 units of the 10k/day quota per call), budgeted by the resolver.
 *  - videos.list — 1 unit per call of up to 50 ids, used for the mandatory
 *    status checks (embeddable, madeForKids per DP III.E.4.j) and the weekly
 *    re-verify pass.
 *
 * Key handling mirrors the house pattern (see lambdas/image-upload/src/
 * cloudflare.ts): YOUTUBE_API_KEY plaintext for local dev, else
 * YOUTUBE_API_KEY_SECRET_NAME fetched from Secrets Manager at cold start.
 */

import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';

/** MLB's official YouTube channel (https://www.youtube.com/@MLB) — LS-9111. */
export const MLB_CHANNEL_ID = 'UCoLrcjPV5PbUrUyXq5mjc_A';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
/** videos.list accepts at most 50 ids per call. */
export const VIDEOS_LIST_BATCH_SIZE = 50;

const YOUTUBE_API_KEY_LOCAL = process.env['YOUTUBE_API_KEY'] ?? '';
const YOUTUBE_API_KEY_SECRET_NAME =
  process.env['YOUTUBE_API_KEY_SECRET_NAME'] ?? '';

let keyPromise: Promise<string> | null = null;

/** Resolve the API key — local env var first, then Secrets Manager. */
export async function getYouTubeApiKey(): Promise<string> {
  if (YOUTUBE_API_KEY_LOCAL) return YOUTUBE_API_KEY_LOCAL;
  if (!YOUTUBE_API_KEY_SECRET_NAME) {
    throw new Error(
      'Either YOUTUBE_API_KEY (local dev) or YOUTUBE_API_KEY_SECRET_NAME (production) must be set',
    );
  }
  if (!keyPromise) {
    keyPromise = retrieveSecretParameterValue(
      YOUTUBE_API_KEY_SECRET_NAME,
    ).catch((err) => {
      // Reset so the next invocation retries instead of receiving the same
      // permanently-rejected promise.
      keyPromise = null;
      throw err;
    });
  }
  return keyPromise;
}

export interface YouTubeSearchHit {
  videoId: string;
  title: string;
}

export interface YouTubeVideoStatus {
  videoId: string;
  title: string | null;
  embeddable: boolean;
  madeForKids: boolean;
  isPublic: boolean;
}

interface SearchListResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: { title?: string };
  }>;
}

interface VideosListResponse {
  items?: Array<{
    id?: string;
    snippet?: { title?: string };
    status?: {
      embeddable?: boolean;
      madeForKids?: boolean;
      privacyStatus?: string;
    };
  }>;
}

async function youtubeGet<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<T> {
  const apiKey = await getYouTubeApiKey();
  const search = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetch(`${YOUTUBE_API_BASE}/${endpoint}?${search}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`YouTube ${endpoint} returned ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

/** True when an error looks like the daily search quota is exhausted. */
export function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /quota/i.test(message) || / 403:/.test(message);
}

/**
 * search.list restricted to the MLB channel for one player's highlights —
 * the quota-budgeted call (the caller counts these against the daily budget).
 */
export async function searchMlbChannelHighlights(
  playerName: string,
): Promise<YouTubeSearchHit[]> {
  const data = await youtubeGet<SearchListResponse>('search', {
    part: 'snippet',
    channelId: MLB_CHANNEL_ID,
    q: `${playerName} highlights`,
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '5',
  });
  return (data.items ?? [])
    .map((item) => ({
      videoId: item.id?.videoId ?? '',
      title: item.snippet?.title ?? '',
    }))
    .filter((hit) => hit.videoId !== '');
}

/**
 * videos.list status + snippet for up to 50 ids per call (1 quota unit each).
 * Videos absent from the response (deleted/private) are absent from the map.
 */
export async function getVideoStatuses(
  videoIds: string[],
): Promise<Map<string, YouTubeVideoStatus>> {
  const statuses = new Map<string, YouTubeVideoStatus>();
  for (let i = 0; i < videoIds.length; i += VIDEOS_LIST_BATCH_SIZE) {
    const chunk = videoIds.slice(i, i + VIDEOS_LIST_BATCH_SIZE);
    const data = await youtubeGet<VideosListResponse>('videos', {
      part: 'status,snippet',
      id: chunk.join(','),
    });
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      statuses.set(item.id, {
        videoId: item.id,
        title: item.snippet?.title ?? null,
        embeddable: item.status?.embeddable === true,
        madeForKids: item.status?.madeForKids === true,
        isPublic: item.status?.privacyStatus === 'public',
      });
    }
  }
  return statuses;
}

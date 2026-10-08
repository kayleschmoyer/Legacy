/**
 * Tests for the highlight-video resolver mutations (LS-9113):
 *   - resolveResolveHighlightVideos
 *   - resolveVerifyHighlightVideos
 *
 * Covers:
 *   - UNAUTHENTICATED guard on both mutations
 *   - Search budget: never exceeds the 95-call ceiling, arg cannot raise it
 *   - Validation before caching: full-name auto-accept; last-name-only match
 *     routed through the relevance judge; judge rejection → unresolved marker
 *   - Made-for-Kids / non-embeddable / non-public hits are never cached
 *   - Quota errors stop the run instead of burning further calls
 *   - Verify pass: refreshes valid rows, purges gone/flipped videos, runs
 *     the 30-day stale purge, and leaves rows untouched on chunk errors
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn(),
  initRollbar: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  withRollbar: jest.fn((fn) => fn),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(),
  retrieveSecretParameterValue: jest.fn(),
}));

const mockGetCandidates = jest.fn();
const mockUpsertResolutions = jest.fn();
const mockGetForVerification = jest.fn();
const mockApplyVerifications = jest.fn();
const mockPurge = jest.fn();
const mockPurgeStale = jest.fn();
const mockGetByPlayerIds = jest.fn();

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    createDatabaseService: jest.fn(() => ({
      players: {
        getHighlightVideoResolutionCandidates: mockGetCandidates,
        upsertHighlightVideoResolutions: mockUpsertResolutions,
        getHighlightVideosForVerification: mockGetForVerification,
        applyHighlightVideoVerifications: mockApplyVerifications,
        purgeHighlightVideos: mockPurge,
        purgeStaleHighlightVideos: mockPurgeStale,
        getHighlightVideosByPlayerIds: mockGetByPlayerIds,
      },
    })),
    PublicSchema: {
      leagueMembers: {
        leagueId: 'league_members.league_id',
        userId: 'league_members.user_id',
        permissionLevel: 'league_members.permission_level',
      },
    },
  }),
);

const mockSearch = jest.fn();
const mockGetVideoStatuses = jest.fn();

jest.mock('./youtube-api', () => ({
  MLB_CHANNEL_ID: 'UCoLrcjPV5PbUrUyXq5mjc_A',
  VIDEOS_LIST_BATCH_SIZE: 50,
  getYouTubeApiKey: () => Promise.resolve('test-key'),
  searchMlbChannelHighlights: (...args: unknown[]) => mockSearch(...args),
  getVideoStatuses: (...args: unknown[]) => mockGetVideoStatuses(...args),
  isQuotaError: (err: unknown) =>
    /quota/i.test(err instanceof Error ? err.message : String(err)),
}));

const mockJudgeRelevance = jest.fn();

jest.mock('./relevance', () => ({
  ...jest.requireActual('./relevance'),
  judgeRelevance: (...args: unknown[]) => mockJudgeRelevance(...args),
}));

import { type Context } from '../builder';
import {
  MAX_CLIP_SECONDS,
  RESOLVE_SEARCH_BUDGET,
  resolveResolveHighlightVideos,
  resolveVerifyHighlightVideos,
} from './index';

function makeContext(
  partial: Pick<Context, 'isSystemRequest' | 'user'>,
): Context {
  return partial as unknown as Context;
}

const systemContext = makeContext({ isSystemRequest: true, user: null });

interface CandidateOverrides {
  playerId?: number;
  firstName?: string;
  lastName?: string;
  mlbTeam?: string | null;
  firstSeason?: number | null;
  lastSeason?: number | null;
}

function makeCandidate(overrides: CandidateOverrides = {}) {
  return {
    playerId: 42,
    firstName: 'Johnny',
    lastName: 'Mize',
    mlbTeam: null,
    firstSeason: 1936,
    lastSeason: 1953,
    ...overrides,
  };
}

function statusMap(
  entries: Array<{
    videoId: string;
    title?: string | null;
    embeddable?: boolean;
    madeForKids?: boolean;
    isPublic?: boolean;
    durationSeconds?: number | null;
    isVertical?: boolean;
  }>,
) {
  return new Map(
    entries.map((e) => [
      e.videoId,
      {
        videoId: e.videoId,
        title: e.title ?? null,
        embeddable: e.embeddable ?? true,
        madeForKids: e.madeForKids ?? false,
        isPublic: e.isPublic ?? true,
        // A splash-eligible single-play clip unless a test says otherwise.
        durationSeconds:
          e.durationSeconds === undefined ? 20 : e.durationSeconds,
        isVertical: e.isVertical ?? false,
      },
    ]),
  );
}

describe('resolveResolveHighlightVideos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertResolutions.mockResolvedValue(0);
  });

  it('rejects unauthenticated requests with UNAUTHENTICATED error', async () => {
    const context = makeContext({ isSystemRequest: false, user: null });
    await expect(
      resolveResolveHighlightVideos(context, null),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('caps the search budget at RESOLVE_SEARCH_BUDGET even when asked for more', async () => {
    mockGetCandidates.mockResolvedValue([]);
    const result = await resolveResolveHighlightVideos(systemContext, 10_000);
    expect(mockGetCandidates).toHaveBeenCalledWith(RESOLVE_SEARCH_BUDGET);
    expect(result.searchesUsed).toBe(0);
  });

  it('auto-accepts a full "First Last" title match and caches it validated', async () => {
    mockGetCandidates.mockResolvedValue([
      makeCandidate({ playerId: 7, firstName: 'Jim', lastName: 'Thome' }),
    ]);
    mockSearch.mockResolvedValue([
      { videoId: 'vid1', title: 'Jim Thome hits his 600th home run' },
    ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([
        { videoId: 'vid1', title: 'Jim Thome hits his 600th home run' },
      ]),
    );

    const result = await resolveResolveHighlightVideos(systemContext, null);

    expect(result.playersResolved).toBe(1);
    expect(mockJudgeRelevance).not.toHaveBeenCalled();
    expect(mockUpsertResolutions).toHaveBeenCalledWith([
      expect.objectContaining({
        playerId: 7,
        youtubeVideoId: 'vid1',
        matchMethod: 'full_name',
        madeForKids: false,
        embeddable: true,
        durationSeconds: 20,
      }),
    ]);
  });

  it('skips clips longer than MAX_CLIP_SECONDS, vertical, or of unknown length (LS-10973)', async () => {
    mockGetCandidates.mockResolvedValue([
      makeCandidate({ playerId: 7, firstName: 'Jim', lastName: 'Thome' }),
    ]);
    const title = 'Jim Thome hits his 600th home run';
    mockSearch.mockResolvedValue([
      { videoId: 'reel', title },
      { videoId: 'short', title },
      { videoId: 'live', title },
      { videoId: 'clip', title },
    ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([
        { videoId: 'reel', title, durationSeconds: MAX_CLIP_SECONDS + 1 },
        { videoId: 'short', title, isVertical: true },
        { videoId: 'live', title, durationSeconds: null },
        { videoId: 'clip', title, durationSeconds: MAX_CLIP_SECONDS },
      ]),
    );

    const result = await resolveResolveHighlightVideos(systemContext, null);

    expect(result.playersResolved).toBe(1);
    expect(mockUpsertResolutions).toHaveBeenCalledWith([
      expect.objectContaining({
        playerId: 7,
        youtubeVideoId: 'clip',
        durationSeconds: MAX_CLIP_SECONDS,
      }),
    ]);
  });

  it('routes a last-name-only match through the judge and caches on approval', async () => {
    mockGetCandidates.mockResolvedValue([makeCandidate()]);
    mockSearch.mockResolvedValue([
      { videoId: 'vid2', title: '1952WS GM7: Mize gives Yankees lead' },
    ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([
        { videoId: 'vid2', title: '1952WS GM7: Mize gives Yankees lead' },
      ]),
    );
    mockJudgeRelevance.mockResolvedValue(true);

    const result = await resolveResolveHighlightVideos(systemContext, null);

    expect(mockJudgeRelevance).toHaveBeenCalledWith(
      expect.objectContaining({ playerName: 'Johnny Mize' }),
    );
    expect(result.playersResolved).toBe(1);
    expect(mockUpsertResolutions).toHaveBeenCalledWith([
      expect.objectContaining({ playerId: 42, matchMethod: 'judge' }),
    ]);
  });

  it.each([
    {
      playerId: 33687,
      firstName: 'Cy',
      lastName: 'Young',
      title:
        "BACK-TO-BACK AL CY YOUNG AWARD WINNER Tarik Skubal's FULL 2025 highlights",
    },
    {
      playerId: 20910,
      firstName: 'Walter',
      lastName: 'Johnson',
      title:
        'Max Scherzer is now TENTH all-time in strikeouts (He passed the LEGENDARY Walter Johnson)',
    },
  ])(
    'routes an ambiguous full-name hit ($firstName $lastName) through the judge instead of auto-accepting (LS-10819)',
    async ({ playerId, firstName, lastName, title }) => {
      mockGetCandidates.mockResolvedValue([
        makeCandidate({ playerId, firstName, lastName }),
      ]);
      mockSearch.mockResolvedValue([{ videoId: 'vidX', title }]);
      mockGetVideoStatuses.mockResolvedValue(
        statusMap([{ videoId: 'vidX', title }]),
      );
      mockJudgeRelevance.mockResolvedValue(false);

      const result = await resolveResolveHighlightVideos(systemContext, null);

      expect(mockJudgeRelevance).toHaveBeenCalledWith(
        expect.objectContaining({
          playerName: `${firstName} ${lastName}`,
          videoTitle: title,
        }),
      );
      expect(result.playersResolved).toBe(0);
      expect(mockUpsertResolutions).toHaveBeenCalledWith([
        expect.objectContaining({
          playerId,
          youtubeVideoId: null,
          matchMethod: null,
        }),
      ]);
    },
  );

  it('caches an ambiguous full-name hit as a judge match when the judge approves', async () => {
    const title = 'Hank Aaron hits his 715th career home run';
    mockGetCandidates.mockResolvedValue([
      makeCandidate({ playerId: 1, firstName: 'Hank', lastName: 'Aaron' }),
    ]);
    mockSearch.mockResolvedValue([{ videoId: 'vidH', title }]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([{ videoId: 'vidH', title }]),
    );
    mockJudgeRelevance.mockResolvedValue(true);

    await resolveResolveHighlightVideos(systemContext, null);

    expect(mockUpsertResolutions).toHaveBeenCalledWith([
      expect.objectContaining({
        playerId: 1,
        youtubeVideoId: 'vidH',
        matchMethod: 'judge',
      }),
    ]);
  });

  it('marks the player unresolved when the judge rejects the match', async () => {
    mockGetCandidates.mockResolvedValue([
      makeCandidate({ playerId: 9, firstName: 'Bill', lastName: 'Byrd' }),
    ]);
    mockSearch.mockResolvedValue([
      { videoId: 'vid3', title: 'Byrd launches a walk-off homer' },
    ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([{ videoId: 'vid3', title: 'Byrd launches a walk-off homer' }]),
    );
    mockJudgeRelevance.mockResolvedValue(false);

    const result = await resolveResolveHighlightVideos(systemContext, null);

    expect(result.playersResolved).toBe(0);
    expect(result.playersUnresolved).toBe(1);
    expect(mockUpsertResolutions).toHaveBeenCalledWith([
      expect.objectContaining({
        playerId: 9,
        youtubeVideoId: null,
        matchMethod: null,
      }),
    ]);
  });

  it('never caches Made-for-Kids, non-embeddable, or non-public hits', async () => {
    mockGetCandidates.mockResolvedValue([
      makeCandidate({ playerId: 11, firstName: 'Jim', lastName: 'Thome' }),
    ]);
    mockSearch.mockResolvedValue([
      { videoId: 'kids', title: 'Jim Thome highlights' },
      { videoId: 'noembed', title: 'Jim Thome highlights' },
      { videoId: 'private', title: 'Jim Thome highlights' },
    ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([
        { videoId: 'kids', title: 'Jim Thome highlights', madeForKids: true },
        {
          videoId: 'noembed',
          title: 'Jim Thome highlights',
          embeddable: false,
        },
        {
          videoId: 'private',
          title: 'Jim Thome highlights',
          isPublic: false,
        },
      ]),
    );

    const result = await resolveResolveHighlightVideos(systemContext, null);

    expect(result.playersResolved).toBe(0);
    expect(result.playersUnresolved).toBe(1);
  });

  it('stops the run on a quota error instead of burning further searches', async () => {
    mockGetCandidates.mockResolvedValue([
      makeCandidate({ playerId: 1 }),
      makeCandidate({ playerId: 2 }),
      makeCandidate({ playerId: 3 }),
    ]);
    mockSearch.mockRejectedValueOnce(new Error('quotaExceeded for search'));

    const result = await resolveResolveHighlightVideos(systemContext, null);

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(result.searchesUsed).toBe(1);
    expect(result.errors).toContain('search quota exhausted — stopping run');
  });

  it('collects per-player errors without aborting the run', async () => {
    mockGetCandidates.mockResolvedValue([
      makeCandidate({ playerId: 1, firstName: 'Jim', lastName: 'Thome' }),
      makeCandidate({ playerId: 2, firstName: 'Joe', lastName: 'Torre' }),
    ]);
    mockSearch
      .mockRejectedValueOnce(new Error('transient 500'))
      .mockResolvedValueOnce([
        { videoId: 'vid4', title: 'Joe Torre highlights' },
      ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([{ videoId: 'vid4', title: 'Joe Torre highlights' }]),
    );

    const result = await resolveResolveHighlightVideos(systemContext, null);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('player 1');
    expect(result.playersResolved).toBe(1);
    // The errored player gets no unresolved marker — it retries next run.
    expect(mockUpsertResolutions).toHaveBeenCalledWith([
      expect.objectContaining({ playerId: 2 }),
    ]);
  });
});

describe('resolveVerifyHighlightVideos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyVerifications.mockImplementation(
      async (rows: unknown[]) => rows.length,
    );
    mockPurge.mockImplementation(async (ids: unknown[]) => ids.length);
    mockPurgeStale.mockResolvedValue(0);
  });

  it('rejects unauthenticated requests with UNAUTHENTICATED error', async () => {
    const context = makeContext({ isSystemRequest: false, user: null });
    await expect(resolveVerifyHighlightVideos(context)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });

  it('refreshes valid rows and purges gone or flipped videos', async () => {
    mockGetForVerification.mockResolvedValue([
      { playerId: 1, youtubeVideoId: 'ok' },
      { playerId: 2, youtubeVideoId: 'deleted' },
      { playerId: 3, youtubeVideoId: 'flippedKids' },
    ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([
        { videoId: 'ok', title: 'Fresh title' },
        { videoId: 'flippedKids', title: 'Kids now', madeForKids: true },
      ]),
    );
    mockPurgeStale.mockResolvedValue(4);

    const result = await resolveVerifyHighlightVideos(systemContext);

    expect(result.triggered).toBe(true);
    expect(result.videosChecked).toBe(3);
    expect(result.videosVerified).toBe(1);
    expect(mockApplyVerifications).toHaveBeenCalledWith([
      expect.objectContaining({ playerId: 1, videoTitle: 'Fresh title' }),
    ]);
    expect(mockPurge).toHaveBeenCalledWith([2, 3]);
    expect(result.videosPurged).toBe(2);
    expect(result.stalePurged).toBe(4);
  });

  it('purges cached clips that no longer fit the splash (too long or vertical) and refreshes duration', async () => {
    mockGetForVerification.mockResolvedValue([
      { playerId: 1, youtubeVideoId: 'ok' },
      { playerId: 2, youtubeVideoId: 'reel' },
      { playerId: 3, youtubeVideoId: 'vertical' },
    ]);
    mockGetVideoStatuses.mockResolvedValue(
      statusMap([
        { videoId: 'ok', title: 'Clip', durationSeconds: 18 },
        { videoId: 'reel', title: 'Career reel', durationSeconds: 600 },
        { videoId: 'vertical', title: 'Short', isVertical: true },
      ]),
    );

    await resolveVerifyHighlightVideos(systemContext);

    expect(mockApplyVerifications).toHaveBeenCalledWith([
      expect.objectContaining({ playerId: 1, durationSeconds: 18 }),
    ]);
    expect(mockPurge).toHaveBeenCalledWith([2, 3]);
  });

  it('leaves rows untouched when a videos.list chunk fails', async () => {
    mockGetForVerification.mockResolvedValue([
      { playerId: 1, youtubeVideoId: 'ok' },
    ]);
    mockGetVideoStatuses.mockRejectedValue(new Error('videos.list 500'));

    const result = await resolveVerifyHighlightVideos(systemContext);

    expect(result.triggered).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(mockApplyVerifications).toHaveBeenCalledWith([]);
    expect(mockPurge).toHaveBeenCalledWith([]);
  });
});

/**
 * MockDraftsHub — the Mock Drafts hub (LS-10079), shared by web `/mock-drafts`
 * and native `(app)/mock-draft`. Three tabs:
 *
 * - **Join a draft** — public online lobbies with an open seat
 *   (`publicMockDrafts`). Joining by id needs only a team name.
 * - **My mock drafts** — every mock draft the viewer sits in
 *   (`myMockDrafts`). Lobbies and live drafts resume in the draft room;
 *   completed drafts open there too, where the board renders its results.
 * - **Invites** — the viewer's pending direct invites (`myInvites`).
 *
 * Navigation stays with the caller: web and native route differently.
 * Seat counts refresh when a tab is (re)opened and whenever `refreshKey`
 * changes (native bumps it on screen focus) — live updates are not needed.
 */
import React from 'react';
import {
  Button,
  Card,
  H2,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  GetMyMockDrafts as GET_MY_MOCK_DRAFTS,
  GetPublicMockDrafts as GET_PUBLIC_MOCK_DRAFTS,
  type GetMyMockDraftsQuery,
  type GetMyMockDraftsQueryVariables,
  type GetPublicMockDraftsQuery,
  type GetPublicMockDraftsQueryVariables,
  InviteTargetKind,
  JoinMockDraft as JOIN_MOCK_DRAFT,
  type JoinMockDraftMutation,
  type JoinMockDraftMutationVariables,
  MockDraftListStatus,
  MockDraftMode,
  MyInvites as MY_INVITES,
  type MyInvitesQuery,
  type MyInvitesQueryVariables,
  Sport,
} from '@legacy-sports/graphql';

import { SegmentedControl } from '../../components/ToggleControls';
import { InviteResponseActions } from '../invites/InviteResponseActions';
import type { JoinedTarget } from '../invites/hooks/useInviteCode';

export type MockDraftsHubTab = 'join' | 'mine' | 'invites';

/** A mock draft room to open: resume a lobby/live draft or view results. */
export interface MockDraftRoomTarget {
  draftId: number;
  sport: string;
}

export interface MockDraftsHubProps {
  initialTab?: MockDraftsHubTab;
  /** Sport the "Join a draft" list starts on. */
  initialSport?: 'baseball' | 'football';
  onOpenDraft: (target: MockDraftRoomTarget) => void;
  /** An accepted invite: a mock draft room or a league. */
  onInviteAccepted: (target: JoinedTarget) => void;
  /** "Set up a mock draft" — the setup page for that sport. */
  onCreateMockDraft?: (sport: 'baseball' | 'football') => void;
  /** Bump to refetch the open tab (e.g. on native screen focus). */
  refreshKey?: number;
}

const PAGE_SIZE = 20;

const TAB_OPTIONS = [
  { value: 'join', label: 'Join a draft' },
  { value: 'mine', label: 'My mock drafts' },
  { value: 'invites', label: 'Invites' },
];

// Built on call, not at module load: specs elsewhere mock
// `@legacy-sports/graphql` without these enums and still import this module.
function sportOptions() {
  return [
    { value: Sport.Baseball, label: 'Baseball' },
    { value: Sport.Football, label: 'Football' },
  ];
}

function poolOptions(sport: Sport): { value: string; label: string }[] {
  const options: Record<Sport, { value: string; label: string }[]> = {
    [Sport.Baseball]: [
      { value: 'all', label: 'All' },
      { value: 'nl', label: 'NL' },
      { value: 'al', label: 'AL' },
    ],
    [Sport.Football]: [
      { value: 'all', label: 'All' },
      { value: 'afc', label: 'AFC' },
      { value: 'nfc', label: 'NFC' },
    ],
  };
  return options[sport];
}

function mineOptions() {
  return [
    { value: 'all', label: 'All' },
    { value: MockDraftListStatus.Lobby, label: 'Lobby' },
    { value: MockDraftListStatus.Live, label: 'Live' },
    { value: MockDraftListStatus.Completed, label: 'Completed' },
  ];
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function formatLobbyTimeLeft(
  iso: string | null | undefined,
  now: Date,
): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0
    ? `${String(hours)}h ${String(minutes)}m`
    : `${String(minutes)}m`;
}

function formatPool(pool: string | null | undefined): string {
  if (!pool || pool === 'all') return 'All players';
  return pool.toUpperCase();
}

function capitalize(value: string | null | undefined): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <XStack justifyContent="space-between" gap="$3">
      <Text color="$textMuted" fontSize="$3">
        {label}
      </Text>
      <Text color="$color" fontSize="$3" fontWeight="600">
        {value}
      </Text>
    </XStack>
  );
}

function EmptyState({
  testID,
  children,
}: {
  testID: string;
  children: React.ReactNode;
}) {
  return (
    <Card bordered padding="$4" testID={testID}>
      <Text color="$textMuted" textAlign="center">
        {children}
      </Text>
    </Card>
  );
}

function LoadMore({
  onPress,
  loading,
  failed,
  testID,
}: {
  onPress: () => void;
  loading: boolean;
  failed: boolean;
  testID: string;
}) {
  return (
    <YStack gap="$2">
      {failed && (
        <Text color="$statusDangerFg" role="alert" fontSize="$3">
          Couldn&apos;t load more. Try again.
        </Text>
      )}
      <Button
        chromeless
        borderWidth={1}
        borderColor="$borderColor"
        disabled={loading}
        onPress={onPress}
        testID={testID}
      >
        {loading ? (
          <Spinner size="small" />
        ) : (
          <Text color="$color">Load more</Text>
        )}
      </Button>
    </YStack>
  );
}

// ── Cursor paging ───────────────────────────────────────────────────────────

interface Connection<T> {
  nodes?: readonly (T | null)[] | null;
  endCursor?: string | null;
  hasNextPage?: boolean | null;
}

/**
 * The first page comes from the cache-backed query (so a refetch refreshes
 * it); later pages are fetched straight from the network and appended
 * locally, then dropped whenever the first page reloads. That keeps the
 * cached first page and the appended pages from fighting over one field.
 */
function useCursorPages<T>(
  first: Connection<T> | null | undefined,
  fetchPage: (after: string) => Promise<Connection<T> | null | undefined>,
) {
  const [extra, setExtra] = React.useState<T[]>([]);
  const [cursor, setCursor] = React.useState<{
    endCursor: string | null;
    hasNextPage: boolean;
  } | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = React.useState(false);

  React.useEffect(() => {
    setExtra([]);
    setCursor(null);
  }, [first]);

  const nodes = React.useMemo(
    () => [...(first?.nodes ?? []).filter((n): n is T => n !== null), ...extra],
    [first, extra],
  );
  const endCursor = cursor ? cursor.endCursor : (first?.endCursor ?? null);
  const hasNextPage = cursor ? cursor.hasNextPage : Boolean(first?.hasNextPage);

  const loadMore = React.useCallback(async () => {
    if (!endCursor) return;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const page = await fetchPage(endCursor);
      setExtra((prev) => [
        ...prev,
        ...(page?.nodes ?? []).filter((n): n is T => n !== null),
      ]);
      setCursor({
        endCursor: page?.endCursor ?? null,
        hasNextPage: Boolean(page?.hasNextPage),
      });
    } catch (err) {
      setLoadMoreFailed(true);
      LOGGER.warn(
        '[MockDraftsHub] load more failed',
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      setLoadingMore(false);
    }
  }, [endCursor, fetchPage]);

  return { nodes, hasNextPage, loadMore, loadingMore, loadMoreFailed };
}

// ── Join a draft ────────────────────────────────────────────────────────────

type PublicLobby = NonNullable<
  NonNullable<
    NonNullable<GetPublicMockDraftsQuery['publicMockDrafts']>['nodes']
  >[number]
>;

function PublicLobbyCard({
  lobby,
  now,
  onJoined,
}: {
  lobby: PublicLobby;
  now: Date;
  onJoined: (target: MockDraftRoomTarget) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [teamName, setTeamName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [joinMock, { loading }] = useMutation<
    JoinMockDraftMutation,
    JoinMockDraftMutationVariables
  >(JOIN_MOCK_DRAFT);

  const trimmed = teamName.trim();
  const canJoin = !loading && trimmed.length > 0;
  const id = String(lobby.draftId);

  const join = async () => {
    setError(null);
    try {
      const result = await joinMock({
        variables: { draftId: lobby.draftId, teamName: trimmed },
      });
      const joined = result.data?.joinMockDraft;
      if (joined?.draftId != null) {
        onJoined({
          draftId: joined.draftId,
          sport: joined.sport ?? lobby.sport ?? Sport.Baseball,
        });
      }
    } catch (err) {
      // The lobby may have filled, started or expired since the list loaded.
      setError(
        "Couldn't join this draft. It may have filled up or started — refresh the list and try another.",
      );
      LOGGER.warn(
        '[MockDraftsHub] joinMockDraft failed',
        err instanceof Error ? err : new Error(String(err)),
        { draftId: lobby.draftId },
      );
    }
  };

  return (
    <Card bordered padding="$4" gap="$2" testID={`public-mock-draft-${id}`}>
      <Text color="$textMuted" fontSize="$2" textTransform="uppercase">
        {capitalize(lobby.sport)} mock draft
      </Text>
      <H2 fontSize="$6" color="$color">
        {lobby.hostUsername ?? 'A friend'}&apos;s lobby
      </H2>
      <Fact label="Player pool" value={formatPool(lobby.playerPool)} />
      <Fact
        label="Seats"
        value={`${String(lobby.filledSeats ?? 0)} / ${String(
          lobby.totalSeats ?? 0,
        )} · ${String(lobby.openSeats ?? 0)} open`}
      />
      <Fact
        label="Pick clock"
        value={`${String(lobby.pickTimeLimitSeconds ?? 0)}s`}
      />
      <Fact label="Rounds" value={String(lobby.rounds ?? 0)} />
      <Fact
        label="Lobby closes in"
        value={formatLobbyTimeLeft(lobby.lobbyExpiresAt, now)}
      />

      {expanded ? (
        <YStack gap="$2" marginTop="$2">
          <Input
            placeholder="Your team name"
            value={teamName}
            onChangeText={setTeamName}
            maxLength={40}
            disabled={loading}
            aria-label="Team name"
            testID={`public-mock-draft-team-${id}`}
          />
          {error && (
            <Text color="$statusDangerFg" role="alert" fontSize="$3">
              {error}
            </Text>
          )}
          <XStack gap="$2" justifyContent="flex-end">
            <Button
              chromeless
              disabled={loading}
              onPress={() => setExpanded(false)}
            >
              <Text color="$textMuted">Cancel</Text>
            </Button>
            <Button
              backgroundColor="$brandGold"
              disabled={!canJoin}
              opacity={canJoin ? 1 : 0.5}
              onPress={() => {
                if (canJoin) void join();
              }}
              aria-label="Join draft"
              testID={`public-mock-draft-confirm-${id}`}
            >
              {loading ? (
                <Spinner size="small" color="$textOnAccent" />
              ) : (
                <Text color="$textOnAccent" fontWeight="700">
                  Join draft
                </Text>
              )}
            </Button>
          </XStack>
        </YStack>
      ) : (
        <Button
          marginTop="$2"
          backgroundColor="$brandGold"
          onPress={() => setExpanded(true)}
          testID={`public-mock-draft-join-${id}`}
        >
          <Text color="$textOnAccent" fontWeight="700">
            Join
          </Text>
        </Button>
      )}
    </Card>
  );
}

function JoinTab({
  initialSport,
  refreshKey,
  onOpenDraft,
  onCreateMockDraft,
}: {
  initialSport: Sport;
  refreshKey: number;
  onOpenDraft: (target: MockDraftRoomTarget) => void;
  onCreateMockDraft?: (sport: 'baseball' | 'football') => void;
}) {
  const client = useApolloClient();
  const [sport, setSport] = React.useState<Sport>(initialSport);
  const [pool, setPool] = React.useState('all');
  const variables = React.useMemo<GetPublicMockDraftsQueryVariables>(
    () => ({
      sport,
      playerPool: pool === 'all' ? null : pool,
      first: PAGE_SIZE,
    }),
    [sport, pool],
  );

  const { data, loading, error, refetch } = useQuery<
    GetPublicMockDraftsQuery,
    GetPublicMockDraftsQueryVariables
  >(GET_PUBLIC_MOCK_DRAFTS, { variables, fetchPolicy: 'cache-and-network' });

  const firstRefresh = React.useRef(true);
  React.useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    void refetch();
  }, [refreshKey, refetch]);

  const fetchPage = React.useCallback(
    async (after: string) => {
      const result = await client.query<
        GetPublicMockDraftsQuery,
        GetPublicMockDraftsQueryVariables
      >({
        query: GET_PUBLIC_MOCK_DRAFTS,
        variables: { ...variables, after },
        fetchPolicy: 'no-cache',
      });
      return result.data?.publicMockDrafts;
    },
    [client, variables],
  );

  const { nodes, hasNextPage, loadMore, loadingMore, loadMoreFailed } =
    useCursorPages<PublicLobby>(data?.publicMockDrafts, fetchPage);
  const now = new Date();

  return (
    <YStack gap="$3" testID="mock-drafts-join-tab">
      <XStack gap="$3" flexWrap="wrap" alignItems="center">
        <SegmentedControl
          options={sportOptions()}
          value={sport}
          onValueChange={(value) => {
            setSport(value as Sport);
            setPool('all');
          }}
          size="sm"
        />
        <SegmentedControl
          options={poolOptions(sport)}
          value={pool}
          onValueChange={setPool}
          size="sm"
        />
      </XStack>

      {loading && nodes.length === 0 && <Spinner size="large" />}
      {error && nodes.length === 0 && (
        <Text color="$statusDangerFg" role="alert">
          Couldn&apos;t load public mock drafts. Try again.
        </Text>
      )}
      {!loading && !error && nodes.length === 0 && (
        <YStack gap="$3">
          <EmptyState testID="mock-drafts-join-empty">
            No public {sport} lobbies have open seats right now.
          </EmptyState>
          {onCreateMockDraft && (
            <Button
              backgroundColor="$brandGold"
              onPress={() => onCreateMockDraft(sport)}
              testID="mock-drafts-create"
            >
              <Text color="$textOnAccent" fontWeight="700">
                Start your own mock draft
              </Text>
            </Button>
          )}
        </YStack>
      )}

      {nodes.map((lobby) => (
        <PublicLobbyCard
          key={lobby.draftId}
          lobby={lobby}
          now={now}
          onJoined={onOpenDraft}
        />
      ))}

      {hasNextPage && (
        <LoadMore
          onPress={() => void loadMore()}
          loading={loadingMore}
          failed={loadMoreFailed}
          testID="mock-drafts-join-more"
        />
      )}
    </YStack>
  );
}

// ── My mock drafts ──────────────────────────────────────────────────────────

type MyMockDraft = NonNullable<
  NonNullable<
    NonNullable<GetMyMockDraftsQuery['myMockDrafts']>['nodes']
  >[number]
>;

function listStatusLabel(status: MockDraftListStatus): string {
  const labels: Record<MockDraftListStatus, string> = {
    [MockDraftListStatus.Lobby]: 'Lobby',
    [MockDraftListStatus.Live]: 'Live',
    [MockDraftListStatus.Completed]: 'Completed',
  };
  return labels[status];
}

function MyMockDraftCard({
  draft,
  onOpen,
}: {
  draft: MyMockDraft;
  onOpen: (target: MockDraftRoomTarget) => void;
}) {
  const completed = draft.listStatus === MockDraftListStatus.Completed;
  const when = completed ? draft.completedAt : draft.createdAt;
  const id = String(draft.draftId);

  return (
    <Card bordered padding="$4" gap="$2" testID={`my-mock-draft-${id}`}>
      <XStack justifyContent="space-between" alignItems="center" gap="$2">
        <Text color="$textMuted" fontSize="$2" textTransform="uppercase">
          {capitalize(draft.sport)} ·{' '}
          {draft.mode === MockDraftMode.Online ? 'Online' : 'Offline'}
          {draft.isHost ? ' · Host' : ''}
        </Text>
        <Text
          color={completed ? '$textMuted' : '$brandGold'}
          fontSize="$2"
          fontWeight="700"
          textTransform="uppercase"
          testID={`my-mock-draft-status-${id}`}
        >
          {draft.listStatus ? listStatusLabel(draft.listStatus) : ''}
        </Text>
      </XStack>
      <H2 fontSize="$6" color="$color">
        {draft.isHost
          ? 'Your mock draft'
          : `${draft.hostUsername ?? 'A friend'}'s mock draft`}
      </H2>
      <Fact label="Player pool" value={formatPool(draft.playerPool)} />
      <Fact
        label="Teams"
        value={`${String(draft.filledSeats ?? 0)} people · ${String(
          draft.totalSeats ?? 0,
        )} teams`}
      />
      <Fact label="Rounds" value={String(draft.rounds ?? 0)} />
      {when && (
        <Fact
          label={completed ? 'Finished' : 'Created'}
          value={new Date(when).toLocaleDateString()}
        />
      )}
      <Button
        marginTop="$2"
        backgroundColor={completed ? 'transparent' : '$brandGold'}
        borderWidth={completed ? 1 : 0}
        borderColor="$borderColor"
        onPress={() => {
          if (draft.draftId != null) {
            onOpen({
              draftId: draft.draftId,
              sport: draft.sport ?? Sport.Baseball,
            });
          }
        }}
        testID={`my-mock-draft-open-${id}`}
      >
        <Text color={completed ? '$color' : '$textOnAccent'} fontWeight="700">
          {completed ? 'View results' : 'Resume'}
        </Text>
      </Button>
    </Card>
  );
}

function MineTab({
  refreshKey,
  onOpenDraft,
}: {
  refreshKey: number;
  onOpenDraft: (target: MockDraftRoomTarget) => void;
}) {
  const client = useApolloClient();
  const [status, setStatus] = React.useState('all');
  const statusVar = status === 'all' ? null : (status as MockDraftListStatus);

  const { data, loading, error, refetch } = useQuery<
    GetMyMockDraftsQuery,
    GetMyMockDraftsQueryVariables
  >(GET_MY_MOCK_DRAFTS, {
    variables: { status: statusVar, first: PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
  });

  const firstRefresh = React.useRef(true);
  React.useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    void refetch();
  }, [refreshKey, refetch]);

  const fetchPage = React.useCallback(
    async (after: string) => {
      const result = await client.query<
        GetMyMockDraftsQuery,
        GetMyMockDraftsQueryVariables
      >({
        query: GET_MY_MOCK_DRAFTS,
        variables: { status: statusVar, first: PAGE_SIZE, after },
        fetchPolicy: 'no-cache',
      });
      return result.data?.myMockDrafts;
    },
    [client, statusVar],
  );

  const { nodes, hasNextPage, loadMore, loadingMore, loadMoreFailed } =
    useCursorPages<MyMockDraft>(data?.myMockDrafts, fetchPage);

  return (
    <YStack gap="$3" testID="mock-drafts-mine-tab">
      <SegmentedControl
        options={mineOptions()}
        value={status}
        onValueChange={setStatus}
        size="sm"
      />

      {loading && nodes.length === 0 && <Spinner size="large" />}
      {error && nodes.length === 0 && (
        <Text color="$statusDangerFg" role="alert">
          Couldn&apos;t load your mock drafts. Try again.
        </Text>
      )}
      {!loading && !error && nodes.length === 0 && (
        <EmptyState testID="mock-drafts-mine-empty">
          You haven&apos;t joined any mock drafts yet.
        </EmptyState>
      )}

      {nodes.map((draft) => (
        <MyMockDraftCard
          key={draft.draftId}
          draft={draft}
          onOpen={onOpenDraft}
        />
      ))}

      {hasNextPage && (
        <LoadMore
          onPress={() => void loadMore()}
          loading={loadingMore}
          failed={loadMoreFailed}
          testID="mock-drafts-mine-more"
        />
      )}
    </YStack>
  );
}

// ── Invites ─────────────────────────────────────────────────────────────────

type HubInvite = NonNullable<
  NonNullable<NonNullable<MyInvitesQuery['myInvites']>['nodes']>[number]
>;

function InvitesTab({
  refreshKey,
  onInviteAccepted,
}: {
  refreshKey: number;
  onInviteAccepted: (target: JoinedTarget) => void;
}) {
  const client = useApolloClient();
  const { data, loading, error, refetch } = useQuery<
    MyInvitesQuery,
    MyInvitesQueryVariables
  >(MY_INVITES, {
    variables: { first: PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
  });

  const firstRefresh = React.useRef(true);
  React.useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    void refetch();
  }, [refreshKey, refetch]);

  const fetchPage = React.useCallback(
    async (after: string) => {
      const result = await client.query<
        MyInvitesQuery,
        MyInvitesQueryVariables
      >({
        query: MY_INVITES,
        variables: { first: PAGE_SIZE, after },
        fetchPolicy: 'no-cache',
      });
      return result.data?.myInvites;
    },
    [client],
  );

  const { nodes, hasNextPage, loadMore, loadingMore, loadMoreFailed } =
    useCursorPages<HubInvite>(data?.myInvites, fetchPage);

  return (
    <YStack gap="$3" testID="mock-drafts-invites-tab">
      {loading && nodes.length === 0 && <Spinner size="large" />}
      {error && nodes.length === 0 && (
        <Text color="$statusDangerFg" role="alert">
          Couldn&apos;t load your invites. Try again.
        </Text>
      )}
      {!loading && !error && nodes.length === 0 && (
        <EmptyState testID="mock-drafts-invites-empty">
          No pending invites.
        </EmptyState>
      )}

      {nodes.map((invite) =>
        invite.id == null ? null : (
          <Card
            key={invite.id}
            bordered
            padding="$4"
            gap="$2"
            testID={`hub-invite-${String(invite.id)}`}
          >
            <Text color="$textMuted" fontSize="$2" textTransform="uppercase">
              {capitalize(invite.sport)}{' '}
              {invite.kind === InviteTargetKind.Mock ? 'mock draft' : 'league'}
            </Text>
            <Text color="$color" fontSize="$5" fontWeight="700">
              {invite.invitedByUsername ?? 'Someone'} invited you to{' '}
              {invite.targetName ?? 'a draft'}
            </Text>
            <InviteResponseActions
              inviteId={invite.id}
              onAccepted={onInviteAccepted}
            />
          </Card>
        ),
      )}

      {hasNextPage && (
        <LoadMore
          onPress={() => void loadMore()}
          loading={loadingMore}
          failed={loadMoreFailed}
          testID="mock-drafts-invites-more"
        />
      )}
    </YStack>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

export function MockDraftsHub({
  initialTab = 'join',
  initialSport = 'baseball',
  onOpenDraft,
  onInviteAccepted,
  onCreateMockDraft,
  refreshKey = 0,
}: MockDraftsHubProps): React.JSX.Element {
  const [tab, setTab] = React.useState<MockDraftsHubTab>(initialTab);

  return (
    <YStack
      gap="$4"
      padding="$4"
      maxWidth={720}
      width="100%"
      alignSelf="center"
      testID="mock-drafts-hub"
    >
      <XStack justifyContent="space-between" alignItems="center" gap="$3">
        <H2 fontSize="$8" color="$color">
          Mock Drafts
        </H2>
        {onCreateMockDraft && (
          <Button
            size="$3"
            backgroundColor="$brandGold"
            onPress={() => onCreateMockDraft(initialSport)}
            testID="mock-drafts-new"
          >
            <Text color="$textOnAccent" fontWeight="700">
              New mock draft
            </Text>
          </Button>
        )}
      </XStack>

      <SegmentedControl
        options={TAB_OPTIONS}
        value={tab}
        onValueChange={(value) => setTab(value as MockDraftsHubTab)}
        fullWidth
      />

      {/* Each tab mounts fresh when opened, so it refetches on (re)open. */}
      {tab === 'join' && (
        <JoinTab
          initialSport={
            initialSport === 'football' ? Sport.Football : Sport.Baseball
          }
          refreshKey={refreshKey}
          onOpenDraft={onOpenDraft}
          onCreateMockDraft={onCreateMockDraft}
        />
      )}
      {tab === 'mine' && (
        <MineTab refreshKey={refreshKey} onOpenDraft={onOpenDraft} />
      )}
      {tab === 'invites' && (
        <InvitesTab
          refreshKey={refreshKey}
          onInviteAccepted={onInviteAccepted}
        />
      )}
    </YStack>
  );
}

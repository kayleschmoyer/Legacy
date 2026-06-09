import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart2,
  ChevronLeft,
  RefreshCw,
  Users,
} from '@tamagui/lucide-icons';
import { Spinner, Text, XStack, YStack } from 'tamagui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { TradingCenter } from '../../features/baseball/TradingCenter';
import {
  useGetLeagueByIdQuery,
  useGetTeamTradeOffersQuery,
  useGetUserLeaguesQuery,
  useGetUserTeamIdQuery,
} from '../../api/db/graphql.generated';
import { PageMeta } from '../../components/PageMeta';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import { BRAND_GOLD, withAlpha } from '../../constants/colors';

// ── Trade Analyzer premium upsell card ───────────────────────────────────────

function TradeAnalyzerCard(): React.JSX.Element {
  const isPremium = useIsPremium();

  return (
    <YStack gap="$3">
      <XStack alignItems="center" gap="$2">
        <BarChart2 size={18} color="$color" />
        <Text
          fontSize="$5"
          fontWeight="700"
          color="$color"
          style={{
            fontFamily: "'Big Shoulders Display', system-ui, sans-serif",
          }}
        >
          Trade Analyzer
        </Text>
        {!isPremium && (
          <XStack
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$2"
            style={{ background: withAlpha(BRAND_GOLD, 0.15) }}
          >
            <Text fontSize="$1" fontWeight="700" style={{ color: BRAND_GOLD }}>
              PREMIUM
            </Text>
          </XStack>
        )}
      </XStack>

      <PremiumGate
        isPremium={isPremium}
        featureName="Trade Analyzer"
        featureDescription="Evaluate trade fairness with projected values, rest-of-season stats, and roster impact scores."
      >
        {/* Teaser — blurred for free users, visible (coming soon) for premium */}
        <YStack
          gap="$3"
          padding="$4"
          backgroundColor="$surfacePanel"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$outlineSubtle"
        >
          <XStack gap="$3">
            <YStack flex={1} gap="$2">
              <Text fontWeight="600" fontSize="$3" color="$color">
                You Give
              </Text>
              {['Mike Trout', 'Shohei Ohtani'].map((p) => (
                <XStack
                  key={p}
                  alignItems="center"
                  gap="$2"
                  padding="$2"
                  backgroundColor="$surfaceSubtle"
                  borderRadius="$3"
                >
                  <Text fontSize="$3" color="$color">
                    {p}
                  </Text>
                </XStack>
              ))}
            </YStack>
            <ArrowLeftRight
              size={20}
              color="$colorPress"
              style={{ alignSelf: 'center' }}
            />
            <YStack flex={1} gap="$2">
              <Text fontWeight="600" fontSize="$3" color="$color">
                You Get
              </Text>
              {['Ronald Acuña Jr.', 'Juan Soto'].map((p) => (
                <XStack
                  key={p}
                  alignItems="center"
                  gap="$2"
                  padding="$2"
                  backgroundColor="$surfaceSubtle"
                  borderRadius="$3"
                >
                  <Text fontSize="$3" color="$color">
                    {p}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </XStack>
          <YStack
            padding="$3"
            backgroundColor="$surfaceSubtle"
            borderRadius="$3"
            gap="$1"
          >
            <Text fontWeight="700" fontSize="$4" color="$color">
              Analysis
            </Text>
            <Text fontSize="$3" color="$colorPress">
              Trade value: Slightly favors you
            </Text>
            <Text fontSize="$3" color="$colorPress">
              ROS impact: +12.4 pts/week
            </Text>
          </YStack>
          {isPremium && (
            <YStack alignItems="center" padding="$2">
              <Text
                fontSize="$3"
                color="$colorPress"
                textAlign="center"
                fontStyle="italic"
              >
                Coming soon — AI-powered trade analysis is under development.
              </Text>
            </YStack>
          )}
        </YStack>
      </PremiumGate>
    </YStack>
  );
}

// ── League pending-offers badge ───────────────────────────────────────────────

function LeaguePendingBadge({ leagueId }: { leagueId: number }) {
  const { data: teamData } = useGetUserTeamIdQuery({
    variables: { leagueId },
  });
  const teamId = teamData?.userTeamId ?? null;

  const { data: offersData } = useGetTeamTradeOffersQuery({
    variables: { teamId: teamId!, status: 'pending' },
    skip: teamId == null,
  });

  const count = offersData?.teamTradeOffers?.length ?? 0;
  if (count === 0) return null;

  return (
    <div
      aria-label={`${count} pending offer${count !== 1 ? 's' : ''}`}
      style={{
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#C41E3A',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 5,
        paddingRight: 5,
        flexShrink: 0,
      }}
    >
      {count}
    </div>
  );
}

// ── League trades view ────────────────────────────────────────────────────────

interface LeagueTradesViewProps {
  leagueId: number;
  leagueName: string;
  onBack: () => void;
}

function LeagueTradesView({
  leagueId,
  leagueName,
  onBack,
}: LeagueTradesViewProps) {
  const { data: teamData, loading: teamLoading } = useGetUserTeamIdQuery({
    variables: { leagueId },
  });
  const userTeamId = teamData?.userTeamId ?? null;

  const { data: leagueData, loading: leagueLoading } = useGetLeagueByIdQuery({
    variables: { id: leagueId },
    skip: !leagueId,
  });
  const league = leagueData?.league;
  const permissionLevel = league?.userMembership?.permissionLevel;
  const isCommissioner =
    permissionLevel === 'general_manager' ||
    permissionLevel === 'assistant_manager' ||
    permissionLevel === 'commissioner';

  if (teamLoading || leagueLoading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap="$3"
        minHeight={200}
      >
        <Spinner size="large" color="$color" />
        <Text color="$colorPress" fontSize="$3">
          Loading trades…
        </Text>
      </YStack>
    );
  }

  return (
    <YStack gap="$4">
      <XStack alignItems="center" gap="$2">
        <Text
          tag="button"
          onPress={onBack}
          color="$blue10"
          fontSize="$4"
          pressStyle={{ opacity: 0.7 }}
          accessibilityRole="button"
          cursor="pointer"
          style={
            {
              background: 'none',
              border: 'none',
              padding: 0,
            } as React.CSSProperties
          }
        >
          <XStack alignItems="center" gap="$1">
            <ChevronLeft size={16} color="$blue10" />
            <Text color="$blue10" fontSize="$3">
              {leagueName}
            </Text>
          </XStack>
        </Text>
      </XStack>

      {userTeamId == null ? (
        <YStack
          alignItems="center"
          justifyContent="center"
          gap="$3"
          padding="$6"
          backgroundColor="$surfacePanel"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$outlineSubtle"
        >
          <ArrowLeftRight size={32} color="$colorPress" />
          <Text color="$colorPress" fontSize="$4" textAlign="center">
            You are not a member of {leagueName}.
          </Text>
          <Text color="$colorPress" fontSize="$3" textAlign="center">
            Join this league to view and submit trade offers.
          </Text>
          <Link
            to="/baseball/leagues"
            style={{
              color: 'var(--blue10)',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Browse Leagues
          </Link>
        </YStack>
      ) : (
        <TradingCenter
          leagueId={leagueId}
          userTeamId={userTeamId}
          isCommissioner={isCommissioner}
        />
      )}
    </YStack>
  );
}

// ── TradeCenterPage ───────────────────────────────────────────────────────────

export function TradeCenterPage(): React.JSX.Element {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedLeague, setSelectedLeague] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const { data, loading, error, refetch } = useGetUserLeaguesQuery({
    skip: !user,
  });

  const leagues = data?.userLeagues ?? [];

  // Pre-select league from ?leagueId= query param for notification deep links
  const leagueIdParam = searchParams.get('leagueId');
  useEffect(() => {
    if (!leagueIdParam || selectedLeague != null) return;
    const id = parseInt(leagueIdParam, 10);
    if (isNaN(id)) return;
    const matched = leagues.find((l) => l.id === id);
    if (matched?.id != null) {
      setSelectedLeague({ id: matched.id, name: matched.name ?? 'League' });
    }
  }, [leagueIdParam, leagues, selectedLeague]);

  function handleLeagueSelect(id: number, name: string) {
    setSelectedLeague({ id, name });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('leagueId', String(id));
      return next;
    });
  }

  function handleBack() {
    setSelectedLeague(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('leagueId');
      return next;
    });
  }

  return (
    <>
      <PageMeta
        title="Trade Center"
        description="View and manage pending trade offers across your fantasy leagues."
      />
      <YStack gap="$4" maxWidth={900} width="100%" alignSelf="center">
        <XStack alignItems="center" gap="$3">
          <ArrowLeftRight size={22} color="$color" />
          <Text
            fontSize="$7"
            fontWeight="700"
            color="$color"
            style={{
              fontFamily: "'Big Shoulders Display', system-ui, sans-serif",
            }}
          >
            Trade Center
          </Text>
        </XStack>

        {selectedLeague != null ? (
          <LeagueTradesView
            leagueId={selectedLeague.id}
            leagueName={selectedLeague.name}
            onBack={handleBack}
          />
        ) : (
          <YStack gap="$4">
            <Text color="$colorPress" fontSize="$3">
              Select a league to view and manage trade offers.
            </Text>

            {loading && (
              <YStack alignItems="center" padding="$6">
                <Spinner size="large" color="$color" />
              </YStack>
            )}

            {error && (
              <YStack
                alignItems="center"
                justifyContent="center"
                gap="$3"
                padding="$6"
                backgroundColor="$surfacePanel"
                borderRadius="$5"
                borderWidth={1}
                borderColor="$outlineSubtle"
              >
                <RefreshCw size={32} color="$colorPress" />
                <Text color="$colorPress" fontSize="$4" textAlign="center">
                  Failed to load leagues.
                </Text>
                <Text
                  tag="button"
                  onPress={() => void refetch()}
                  color="$blue10"
                  fontSize="$3"
                  pressStyle={{ opacity: 0.7 }}
                  accessibilityRole="button"
                  cursor="pointer"
                  style={
                    {
                      background: 'none',
                      border: 'none',
                      padding: 0,
                    } as React.CSSProperties
                  }
                >
                  Try again
                </Text>
              </YStack>
            )}

            {!loading && !error && leagues.length === 0 && (
              <YStack
                alignItems="center"
                justifyContent="center"
                gap="$3"
                padding="$6"
                backgroundColor="$surfacePanel"
                borderRadius="$5"
                borderWidth={1}
                borderColor="$outlineSubtle"
              >
                <Users size={32} color="$colorPress" />
                <Text color="$colorPress" fontSize="$4" textAlign="center">
                  No leagues yet.
                </Text>
                <XStack gap="$3" flexWrap="wrap" justifyContent="center">
                  <Link
                    to="/baseball/leagues"
                    style={{
                      color: 'var(--blue10)',
                      textDecoration: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Browse Leagues
                  </Link>
                  <Link
                    to="/league/create"
                    style={{
                      color: 'var(--blue10)',
                      textDecoration: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Create a League
                  </Link>
                </XStack>
              </YStack>
            )}

            {!loading &&
              !error &&
              leagues.map((league) => {
                if (!league.id) return null;
                return (
                  <div
                    key={league.id}
                    onClick={() =>
                      handleLeagueSelect(league.id!, league.name ?? 'League')
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`View trades for ${league.name ?? 'League'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleLeagueSelect(league.id!, league.name ?? 'League');
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 16,
                      backgroundColor: 'var(--surfacePanel)',
                      border: '1px solid var(--outlineSubtle)',
                      borderRadius: 12,
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'opacity 120ms',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.opacity =
                        '0.8')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLDivElement).style.opacity = '1')
                    }
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        backgroundColor: 'var(--surfaceSubtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ArrowLeftRight size={18} />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {league.name}
                      </div>
                    </div>
                    <LeaguePendingBadge leagueId={league.id} />
                  </div>
                );
              })}

            {!loading && !error && <TradeAnalyzerCard />}
          </YStack>
        )}
      </YStack>
    </>
  );
}

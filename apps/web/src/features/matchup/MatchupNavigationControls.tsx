import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Spinner, styled, Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, ChevronRight, RotateCcw } from '@tamagui/lucide-icons';
import { useNavigate } from 'react-router-dom';
import {
  type MatchupFragment,
  useGetLeagueTeamsQuery,
} from '../../api/db/graphql.generated';
import { useMatchupsByWeek } from '../../hooks/useMatchup';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

// ── Styled Components ─────────────────────────────────────────────────────────

const NavCard = styled(Card, {
  overflow: 'hidden',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  backgroundColor: '$surfacePanel',
  width: '100%',
});

const WeekStepperRow = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: '$4',
  paddingVertical: '$3',
  borderBottomWidth: 1,
  borderBottomColor: '$surfacePanelBorder',
});

const StepperButton = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: '$4',
  cursor: 'pointer',
  hoverStyle: { backgroundColor: '$surfaceInteractive' },
  pressStyle: { backgroundColor: '$accentMuted', scale: 0.95 },
  variants: {
    disabled: {
      true: {
        opacity: 0.3,
        cursor: 'default',
        hoverStyle: { backgroundColor: 'transparent' },
        pressStyle: { backgroundColor: 'transparent', scale: 1 },
      },
    },
  } as const,
});

const WeekBadge = styled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  borderWidth: 1,
});

const MatchupCardButton = styled(YStack, {
  borderRadius: '$5',
  borderWidth: 1.5,
  borderColor: '$outlineSubtle',
  backgroundColor: '$background',
  paddingVertical: '$2.5',
  paddingHorizontal: '$3',
  cursor: 'pointer',
  minWidth: 160,
  gap: '$1',
  hoverStyle: {
    borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
    backgroundColor: '$surfaceInteractive',
  },
  pressStyle: {
    scale: 0.97,
    backgroundColor: '$accentMuted',
  },
  variants: {
    active: {
      true: {
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
        backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
      },
    },
  } as const,
});

const UserBadge = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$2',
  paddingVertical: '$1',
  borderRadius: '$10',
  backgroundColor: '$green3',
  borderWidth: 1,
  borderColor: '$green7',
});

const BackToCurrentButton = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  borderRadius: '$4',
  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.18),
  borderWidth: 1,
  borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
  cursor: 'pointer',
  hoverStyle: { backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.25) },
  pressStyle: { scale: 0.97 },
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchupNavigationControlsProps {
  currentMatchup: MatchupFragment;
  leagueId: number;
  allMatchups?: MatchupFragment[];
  /** The user's team ID to highlight "Your Matchup" */
  userTeamId?: number | null;
  /** Whether we're showing a different matchup than the user's current one */
  isViewingOther?: boolean;
  /** Optional callback for matchup changes (for inline navigation). If not provided, uses router navigation. */
  onMatchupChange?: (matchupId: string) => void;
  /** Callback to reset to the user's current matchup */
  onResetToDefault?: () => void;
}

/**
 * MatchupNavigationControls — Week stepper + matchup card grid
 *
 * Replaces the old dropdown-based selectors with a modern week stepper
 * (prev / "Week N" / next) and a horizontally scrolling row of tappable
 * matchup cards showing team names, scores, and a "You" badge.
 */
export function MatchupNavigationControls({
  currentMatchup,
  leagueId,
  allMatchups = [],
  userTeamId,
  isViewingOther = false,
  onMatchupChange,
  onResetToDefault,
}: MatchupNavigationControlsProps) {
  const navigate = useNavigate();
  const currentWeek = currentMatchup.weekNumber ?? 1;
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);

  // Sync selected week when the current matchup changes externally.
  // NOTE: selectedWeek is intentionally excluded from deps — this effect
  // should only run when the *external* prop changes (e.g. user navigates
  // to a different matchup via the router), not when the user clicks
  // prev/next week inside this component. Including it caused the pager
  // to reset immediately after every user interaction (LS-510).
  useEffect(() => {
    if (currentMatchup.weekNumber) {
      setSelectedWeek(currentMatchup.weekNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatchup.weekNumber]);

  // Fetch all teams in the league for name lookup
  const {
    data: teamsData,
    loading: teamsLoading,
    error: teamsError,
  } = useGetLeagueTeamsQuery({
    variables: { leagueId },
  });

  // Fetch matchups for the selected week
  const { matchups: weekMatchupsRaw, loading: matchupsLoading } =
    useMatchupsByWeek(leagueId, selectedWeek);

  // Sort so the user's matchup always appears first
  const weekMatchups = useMemo(() => {
    if (!userTeamId) return weekMatchupsRaw;
    return [...weekMatchupsRaw].sort((a, b) => {
      const aIsUser =
        a.team1Id === userTeamId || a.team2Id === userTeamId ? 1 : 0;
      const bIsUser =
        b.team1Id === userTeamId || b.team2Id === userTeamId ? 1 : 0;
      return bIsUser - aIsUser;
    });
  }, [weekMatchupsRaw, userTeamId]);

  // Available weeks, sorted ascending
  const availableWeeks = useMemo(() => {
    if (allMatchups.length === 0) return [currentWeek];
    const weeks = new Set(allMatchups.map((m) => m.weekNumber).filter(Boolean));
    return Array.from(weeks).sort((a, b) => (a ?? 0) - (b ?? 0));
  }, [allMatchups, currentWeek]);

  const weekIndex = availableWeeks.indexOf(selectedWeek);
  const canGoPrev = weekIndex > 0;
  const canGoNext = weekIndex < availableWeeks.length - 1;
  const totalWeeks = availableWeeks.length;
  const isCurrentWeek = selectedWeek === currentWeek;

  // Index-stable team name lookup
  const teamMap = useMemo(() => {
    const arr = teamsData?.leagueTeams ?? [];
    const map = new Map<number, string>();
    arr.forEach((t) => {
      if (t.id && t.name) map.set(t.id, t.name);
    });
    return map;
  }, [teamsData]);

  const teamName = useCallback(
    (id: number | null | undefined) => teamMap.get(id ?? 0) ?? 'TBD',
    [teamMap],
  );

  // ── Handlers ──────────────────────────────────────────────────────────

  const handlePrevWeek = () => {
    if (canGoPrev)
      setSelectedWeek(availableWeeks[weekIndex - 1] ?? selectedWeek);
  };

  const handleNextWeek = () => {
    if (canGoNext)
      setSelectedWeek(availableWeeks[weekIndex + 1] ?? selectedWeek);
  };

  const handleMatchupSelect = (matchupId: string) => {
    if (onMatchupChange) {
      onMatchupChange(matchupId);
    } else {
      const numericId = parseInt(matchupId, 10);
      if (!isNaN(numericId)) {
        navigate(`/baseball/league/${leagueId}/matchups/${numericId}`);
      }
    }
  };

  // ── Error state ───────────────────────────────────────────────────────

  if (teamsError) {
    return (
      <Card
        backgroundColor="$red2"
        borderColor="$red6"
        borderWidth={1}
        borderRadius="$6"
        padding="$3"
      >
        <Text color="$red11" fontSize="$3">
          Error loading teams
        </Text>
      </Card>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <NavCard>
      {/* ── Week Stepper ── */}
      <WeekStepperRow>
        <StepperButton
          disabled={!canGoPrev}
          onPress={handlePrevWeek}
          aria-label="Previous week"
        >
          <ChevronLeft size={18} color="var(--color)" />
        </StepperButton>

        <XStack alignItems="center" gap="$2">
          <Text fontSize="$4" fontWeight="700" color="$color">
            Week {selectedWeek}
          </Text>
          {totalWeeks > 1 && (
            <Text fontSize="$2" color="$textMuted">
              of {totalWeeks}
            </Text>
          )}
          {isCurrentWeek && (
            <WeekBadge backgroundColor="$green3" borderColor="$green7">
              <Text fontSize="$1" fontWeight="700" color="$green11">
                Current
              </Text>
            </WeekBadge>
          )}
        </XStack>

        <StepperButton
          disabled={!canGoNext}
          onPress={handleNextWeek}
          aria-label="Next week"
        >
          <ChevronRight size={18} color="var(--color)" />
        </StepperButton>
      </WeekStepperRow>

      {/* ── Matchup Cards ── */}
      <YStack padding="$3" gap="$3">
        {matchupsLoading || teamsLoading ? (
          <XStack
            alignItems="center"
            justifyContent="center"
            paddingVertical="$4"
            gap="$2"
          >
            <Spinner size="small" color={BRAND_NAVY_LIGHT} />
            <Text color="$textMuted" fontSize="$3">
              Loading matchups…
            </Text>
          </XStack>
        ) : weekMatchups.length === 0 ? (
          <Text
            color="$textMuted"
            fontSize="$3"
            textAlign="center"
            paddingVertical="$3"
          >
            No matchups for Week {selectedWeek}
          </Text>
        ) : (
          <XStack flexWrap="wrap" gap="$2.5">
            {weekMatchups.map((m) => {
              const isActive = m.id === currentMatchup.id;
              const isUserMatchup =
                userTeamId != null &&
                (m.team1Id === userTeamId || m.team2Id === userTeamId);
              const hasScores = m.team1Score != null && m.team2Score != null;

              return (
                <MatchupCardButton
                  key={m.id}
                  active={isActive}
                  onPress={() => {
                    if (m.id) handleMatchupSelect(m.id);
                  }}
                  aria-label={`${teamName(m.team1Id)} vs ${teamName(m.team2Id)}`}
                  aria-selected={isActive}
                >
                  {/* Team names */}
                  <XStack alignItems="center" gap="$2">
                    <YStack flex={1} gap="$0.5">
                      <Text
                        fontSize="$2"
                        fontWeight="700"
                        color={isActive ? BRAND_GOLD_LIGHT : '$color'}
                        numberOfLines={1}
                      >
                        {teamName(m.team1Id)}
                      </Text>
                      <Text
                        fontSize="$2"
                        fontWeight="700"
                        color={isActive ? BRAND_GOLD_LIGHT : '$color'}
                        numberOfLines={1}
                      >
                        {teamName(m.team2Id)}
                      </Text>
                    </YStack>

                    {/* Scores column */}
                    {hasScores && (
                      <YStack alignItems="flex-end" gap="$0.5">
                        <Text
                          fontSize="$2"
                          fontWeight="800"
                          fontVariant={['tabular-nums']}
                          color={
                            (m.team1Score ?? 0) >= (m.team2Score ?? 0)
                              ? '$color'
                              : '$textMuted'
                          }
                        >
                          {(m.team1Score ?? 0).toFixed(1)}
                        </Text>
                        <Text
                          fontSize="$2"
                          fontWeight="800"
                          fontVariant={['tabular-nums']}
                          color={
                            (m.team2Score ?? 0) >= (m.team1Score ?? 0)
                              ? '$color'
                              : '$textMuted'
                          }
                        >
                          {(m.team2Score ?? 0).toFixed(1)}
                        </Text>
                      </YStack>
                    )}
                  </XStack>

                  {/* "You" badge */}
                  {isUserMatchup && (
                    <UserBadge alignSelf="flex-start">
                      <Text fontSize={10} fontWeight="800" color="$green11">
                        YOU
                      </Text>
                    </UserBadge>
                  )}
                </MatchupCardButton>
              );
            })}
          </XStack>
        )}

        {/* Back-to-current inline action */}
        {isViewingOther && onResetToDefault && (
          <BackToCurrentButton onPress={onResetToDefault} alignSelf="center">
            <RotateCcw size={14} color={BRAND_GOLD_LIGHT} />
            <Text fontSize="$2" fontWeight="600" color={BRAND_GOLD_LIGHT}>
              Back to your matchup
            </Text>
          </BackToCurrentButton>
        )}
      </YStack>
    </NavCard>
  );
}

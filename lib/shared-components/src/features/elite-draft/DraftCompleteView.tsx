import React, { useMemo, useState } from 'react';
import { Button, ScrollView, Text, XStack, YStack } from 'tamagui';
import {
  brand,
  darkText,
  scaleDark,
  withAlpha,
} from '@legacy-sports/design-tokens';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { BaseballCard } from './BaseballCard';
import { computeTeamDraftGrade } from './draftGrades';
import {
  getDraftCompletionActions,
  resolveDraftedPlayers,
} from './draftCompletion';
import type { SportKind } from '../../config/sports';

interface DraftCompleteViewProps {
  /**
   * What this draft was, for the copy and CTAs. A mock draft has no league
   * (LS-10076), so this is the draft's own summary rather than a league row.
   */
  draftSummary: { isMock?: boolean; name?: string } | null | undefined;
  leagueId: number | null;
  /** Routes the CTAs to this sport's pages (LS-10528) and picks the roster
   * card's stat set and branding (LS-10827). */
  sport: SportKind;
  pickHistory: DraftPickRecord[];
  myTeamId: number | null;
  myTeam: DraftPlayer[];
  myTeamPicks: DraftPickRecord[];
  leagueTeams: LeagueTeam[];
  statsLookup: Map<number, DraftPlayer>;
  onNavigate: (path: string) => void;
}

// Matches the sticky nav height the live draft board root also sits below,
// so this full-screen state stays flush with the nav bar — same values as
// DraftStateScreens' DraftRootShell (LS-9060).
const NAV_HEIGHT_PX = 75;
const NAV_Z_INDEX = 200;

// Fixed "night stadium" bloom — deliberately not theme-adaptive (matches the
// original decorative background layer). Colors resolved via `withAlpha`
// from named design tokens rather than literal hex/rgba (theme-compliance
// ratchet). Identical to DraftStateScreens' BG_FX_IMAGE (LS-9060) since both
// screens share the same decorative background.
const BG_FX_IMAGE = [
  `radial-gradient(ellipse 80% 50% at 15% 15%, ${withAlpha(brand.gold, 0.06)} 0%, transparent 60%)`,
  `radial-gradient(ellipse 60% 40% at 85% 80%, ${withAlpha(brand.navy, 0.08)} 0%, transparent 60%)`,
  `radial-gradient(ellipse 40% 30% at 50% 50%, ${withAlpha(scaleDark.blue9, 0.04)} 0%, transparent 60%)`,
].join(', ');

interface RosterCardGridProps {
  picks: DraftPickRecord[];
  players: DraftPlayer[];
  sport: SportKind;
  emptyMessage?: string;
}

/** Roster grid — 3-across on web, wraps to fewer columns on narrow widths.
 * CSS Grid has no RN equivalent, so this uses the flexWrap idiom already
 * established for grid-like layouts in this feature (DraftStateScreens'
 * skeleton player grid). */
function RosterCardGrid({
  picks,
  players,
  sport,
  emptyMessage,
}: RosterCardGridProps): React.JSX.Element {
  return (
    <>
      <XStack flexWrap="wrap" gap={10} style={{ paddingTop: 4 }}>
        {picks.map((pick, i) => {
          const player = players[i];
          if (!player) return null;
          return (
            <YStack key={pick.id} width="31%" minWidth={140}>
              <BaseballCard
                player={player}
                round={pick.round}
                pickNumber={pick.pickNumber}
                overallPick={pick.overallPick}
                sport={sport}
              />
            </YStack>
          );
        })}
      </XStack>

      {picks.length === 0 && emptyMessage && (
        <Text color="$textMuted" fontSize={13} textAlign="center" padding={24}>
          {emptyMessage}
        </Text>
      )}
    </>
  );
}

interface GradeStatProps {
  testID: string;
  label: string;
  value: string;
  color: string;
}

function GradeStat({
  testID,
  label,
  value,
  color,
}: GradeStatProps): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      flex={1}
      backgroundColor={withAlpha(darkText.fg1Strong, 0.05)}
      borderRadius={14}
      paddingVertical={12}
      paddingHorizontal={8}
      alignItems="center"
      gap={4}
    >
      <Text
        fontSize={9}
        fontWeight="700"
        letterSpacing={1.2}
        textTransform="uppercase"
        color="$textMuted"
        textAlign="center"
      >
        {label}
      </Text>
      <Text fontFamily="$heading" fontSize={20} fontWeight="800" color={color}>
        {value}
      </Text>
    </YStack>
  );
}

export function DraftCompleteView({
  draftSummary,
  leagueId,
  sport,
  pickHistory,
  myTeamId,
  myTeam,
  myTeamPicks,
  leagueTeams,
  statsLookup,
  onNavigate,
}: DraftCompleteViewProps): React.JSX.Element {
  // Only an explicit tab press is stored; otherwise the selection follows
  // `myTeamId`, so a membership that resolves after mount is still respected
  // (LS-10519). A viewer with no team (a spectator) starts with none selected.
  const [pickedTeamId, setPickedTeamId] = useState<string | null>(null);
  const selectedTeamId =
    pickedTeamId ?? (myTeamId !== null ? String(myTeamId) : null);

  const selectedTeamPicks = useMemo(
    () =>
      selectedTeamId
        ? pickHistory.filter((p) => String(p.teamId) === selectedTeamId)
        : myTeamPicks,
    [pickHistory, selectedTeamId, myTeamPicks],
  );

  const selectedTeamPlayers: DraftPlayer[] = useMemo(
    () => resolveDraftedPlayers(selectedTeamPicks, statsLookup),
    [selectedTeamPicks, statsLookup],
  );

  const { grade, totalValue, projPts } = useMemo(
    () =>
      computeTeamDraftGrade(
        pickHistory,
        selectedTeamPicks,
        selectedTeamPlayers,
        statsLookup,
      ),
    [pickHistory, selectedTeamPicks, selectedTeamPlayers, statsLookup],
  );

  const actions = getDraftCompletionActions({
    sport,
    isMock: draftSummary?.isMock === true,
    leagueId,
  });

  const selectedTeamName = useMemo(() => {
    if (!selectedTeamId) return 'Select a team';
    const team = leagueTeams.find((t) => String(t.id) === selectedTeamId);
    return team?.name ?? 'Unknown Team';
  }, [selectedTeamId, leagueTeams]);

  const isViewingOwnTeam =
    selectedTeamId !== null && selectedTeamId === String(myTeamId);

  return (
    <YStack
      testID="draft-complete-banner"
      style={{
        position: 'fixed',
        top: NAV_HEIGHT_PX,
        right: 0,
        bottom: 0,
        left: 0,
      }}
      zIndex={NAV_Z_INDEX - 2}
      backgroundColor="$background"
      overflow="hidden"
    >
      <YStack
        position="absolute"
        inset={0}
        pointerEvents="none"
        style={{ backgroundImage: BG_FX_IMAGE }}
      />

      {/* Scrollable: a centred, unscrollable column clipped the action
          buttons and roster grid off the top of the screen once a large
          roster (>7 picks) pushed the content taller than the viewport —
          the user had no way to reach "Go to My Leagues" / "Back to
          League" (LS-9240). `flexGrow: 1` keeps short content centred
          exactly as before. */}
      <ScrollView
        flex={1}
        position="relative"
        zIndex={1}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
        }}
      >
        <Text fontSize={56} lineHeight={56} role="img" aria-label="trophy">
          {'🏆'}
        </Text>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={36}
          color="$brandGold"
          letterSpacing={0.7}
          textAlign="center"
        >
          Draft Complete!
        </Text>
        <Text
          fontSize={14}
          color="$textMuted"
          maxWidth={380}
          lineHeight={21}
          textAlign="center"
        >
          {draftSummary?.isMock
            ? `All ${pickHistory.length} picks have been made. No rosters were saved — this was a practice draft.`
            : myTeamId !== null
              ? `All ${pickHistory.length} picks have been made. Your roster is set!`
              : `All ${pickHistory.length} picks have been made.`}
        </Text>

        {/* Next-step CTAs — mock: Practice Again / My Leagues; league:
            Set My Lineup / Back to League. Routed by sport (LS-10528). */}
        <XStack gap="$3" flexWrap="wrap" justifyContent="center" marginTop="$2">
          {actions.map((action) => (
            <Button
              key={action.key}
              testID={`draft-complete-cta-${action.key}`}
              onPress={() => onNavigate(action.path)}
              backgroundColor={
                action.primary
                  ? '$brandGold'
                  : withAlpha(darkText.fg1Strong, 0.1)
              }
              color="white"
              fontWeight="700"
              fontSize={14}
              height={44}
              paddingHorizontal={28}
              borderRadius="$4"
              pressStyle={{ scale: 0.98 }}
              hoverStyle={{
                backgroundColor: action.primary
                  ? '$brandGoldDark'
                  : withAlpha(darkText.fg1Strong, 0.16),
              }}
            >
              {action.label}
            </Button>
          ))}
        </XStack>

        {/* Team selector + roster cards */}
        {leagueTeams.length > 0 && (
          <YStack maxWidth={480} width="100%" marginTop="$6">
            {/* Team tab bar */}
            <XStack
              gap={6}
              flexWrap="wrap"
              justifyContent="center"
              marginBottom="$4"
            >
              {leagueTeams.map((team) => {
                const isActive = selectedTeamId === String(team.id);
                const isMe = String(team.id) === String(myTeamId);
                return (
                  <Button
                    key={team.id}
                    onPress={() => setPickedTeamId(String(team.id))}
                    height="auto"
                    paddingHorizontal={14}
                    paddingVertical={6}
                    borderRadius={20}
                    borderWidth={1}
                    borderColor={
                      isActive
                        ? '$brandGold'
                        : withAlpha(darkText.fg1Strong, 0.15)
                    }
                    backgroundColor={
                      isActive
                        ? withAlpha(brand.gold, 0.2)
                        : withAlpha(darkText.fg1Strong, 0.05)
                    }
                    color={isActive ? '$brandGoldLight' : '$textMuted'}
                    fontSize={12}
                    fontWeight={isActive ? '700' : '500'}
                  >
                    {`${team.name}${isMe ? ' (You)' : ''}`}
                  </Button>
                );
              })}
            </XStack>

            {/* Selected team's grade — same helper as DraftRoomRecap so both
                views grade a team identically (LS-10997). */}
            {selectedTeamId !== null && (
              <XStack
                testID="draft-complete-grade"
                gap={10}
                marginBottom="$4"
                justifyContent="center"
              >
                <GradeStat
                  testID="draft-complete-grade-letter"
                  label="Draft Grade"
                  value={grade}
                  color="$brandGold"
                />
                <GradeStat
                  testID="draft-complete-proj-pts"
                  label="Proj Pts"
                  value={projPts.toFixed(1)}
                  color="$color"
                />
                <GradeStat
                  testID="draft-complete-adp-value"
                  label="ADP Value"
                  value={`${totalValue >= 0 ? '+' : ''}${totalValue}`}
                  color="$statusSuccessFg"
                />
              </XStack>
            )}

            {/* Roster header */}
            <Text
              fontSize={14}
              fontWeight="700"
              marginBottom={12}
              color="$brandGold"
              letterSpacing={1}
              textTransform="uppercase"
            >
              {selectedTeamId === null
                ? 'Select a team to view its roster'
                : isViewingOwnTeam
                  ? `Your Roster (${selectedTeamPlayers.length} players)`
                  : `${selectedTeamName} (${selectedTeamPlayers.length} players)`}
            </Text>

            {/* Roster cards */}
            {selectedTeamId !== null && (
              <RosterCardGrid
                picks={selectedTeamPicks}
                players={selectedTeamPlayers}
                sport={sport}
                emptyMessage="No picks found for this team."
              />
            )}
          </YStack>
        )}

        {/* Fallback: show own roster if no teams data */}
        {leagueTeams.length === 0 && myTeam.length > 0 && (
          <YStack maxWidth={400} width="100%" marginTop="$4">
            <Text
              fontSize={14}
              fontWeight="700"
              marginBottom={12}
              color="$brandGold"
              letterSpacing={1}
              textTransform="uppercase"
            >
              Your Roster ({myTeam.length} players)
            </Text>
            <RosterCardGrid
              picks={myTeamPicks}
              players={myTeam}
              sport={sport}
            />
          </YStack>
        )}
      </ScrollView>
    </YStack>
  );
}

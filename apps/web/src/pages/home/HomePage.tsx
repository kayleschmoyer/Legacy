import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XStack, YStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { Spinner, styled, Text } from 'tamagui';
import { OnThisDayFeed } from '@legacy-sports/shared-components/leagues';
import { formatDraftDate } from '@legacy-sports/utils';
import { formatDisplayName } from '../../lib/formatDisplayName';
import { OnboardingTutorial } from '../../components/onboarding';
import {
  BrandIcon,
  BrandIconBadge,
  type BrandIconName,
} from '../../components/icons';
import { PageMeta } from '../../components/PageMeta';
import {
  useGetArchivedUserLeagueSummariesLazyQuery,
  useGetUserLeagueSummariesQuery,
  type UserLeagueSummaryFragment,
} from '../../api/db/graphql.generated';
import {
  AMBER_WARM,
  BG_DARK,
  BG_LIGHT,
  BORDER_INTERACTIVE,
  BORDER_STRONG,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  GREEN,
  GREEN_DEEP,
  GREEN_LIGHTER,
  PANEL_BORDER,
  SCORE_LOSS,
  SURFACE_CARD,
  SURFACE_DEEP,
  SURFACE_HOVER,
  SURFACE_PANEL,
  TEXT_INTERFACE,
  TEXT_SECONDARY,
  TEXT_SEPARATOR,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';

/* ─── Constants ─── */

const CREATE_BASEBALL_LEAGUE_ROUTE = '/baseball/league/create';
const JOIN_BASEBALL_LEAGUE_ROUTE = '/baseball/league/join';

function leagueDetailRoute(
  summary: Pick<UserLeagueSummaryFragment, 'leagueId' | 'sport'>,
): string {
  const sportPrefix = summary.sport === 'football' ? 'football' : 'baseball';
  return `/${sportPrefix}/league/${summary.leagueId}`;
}

/* ─── Urgency sort ─── */

function urgencyKey(s: UserLeagueSummaryFragment): number {
  if (s.draftStatus === 'in-progress') return 0;
  if (s.leaguePhase === 'active') return 1;
  if (s.leaguePhase === 'pre-draft') return 2;
  return 3;
}

function sortByUrgency(
  summaries: UserLeagueSummaryFragment[],
): UserLeagueSummaryFragment[] {
  return [...summaries].sort((a, b) => urgencyKey(a) - urgencyKey(b));
}

/* ─── Helpers ─── */

function userInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return displayName.slice(0, 2).toUpperCase();
}

function teamInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2)
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.slice(0, 3).toUpperCase();
}

const PREFS_STORAGE_KEY = 'ls_user_preferences';

function readDefaultSport(): 'baseball' | 'football' {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return 'baseball';
    const parsed = JSON.parse(raw) as { defaultSport?: string };
    return parsed.defaultSport === 'football' ? 'football' : 'baseball';
  } catch {
    return 'baseball';
  }
}

/* ─── Sport Config ─── */

interface SportConfig {
  key: string;
  icon: BrandIconName;
  title: string;
  description: string;
  route: string;
  accentBase: string;
  accentAlpha: number;
  available: boolean;
}

const SPORTS: SportConfig[] = [
  {
    key: 'baseball',
    icon: 'baseball',
    title: 'Baseball',
    description:
      '162 games, every era since 1876. Draft Ruth alongside Trout — then watch the archived tape play out.',
    route: '/baseball',
    accentBase: BRAND_NAVY,
    accentAlpha: 0.55,
    available: true,
  },
  {
    key: 'football',
    icon: 'football',
    title: 'Football',
    description:
      'Kickoff for the 2026 season. Same archive-first format, turf green instead of seam red.',
    route: '/football',
    accentBase: GREEN_DEEP,
    accentAlpha: 0.35,
    available: false,
  },
];

/* ─── Page background ─── */

const pageBackgroundStyle: React.CSSProperties = {
  backgroundImage: `
    radial-gradient(ellipse at 20% 0%,  ${withAlpha(BRAND_NAVY, 0.22)} 0%, transparent 55%),
    radial-gradient(ellipse at 80% 10%, ${withAlpha(BRAND_SEAM_RED, 0.1)} 0%, transparent 45%),
    radial-gradient(ellipse at 50% 90%, ${withAlpha(BRAND_GOLD, 0.08)} 0%, transparent 50%)
  `,
};

/* ─── Styled primitives ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$8',
});

const ContentContainer = styled(YStack, {
  maxWidth: 1280,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$4',
  paddingTop: '$8',
  $sm: {
    paddingHorizontal: '$3',
    paddingTop: '$5',
  },
});

/* ─── Phase Chip ─── */

function PhaseChip({
  phase,
  draftStatus,
  hasMatchup,
}: {
  phase: string | null | undefined;
  draftStatus: string | null | undefined;
  hasMatchup?: boolean;
}) {
  const isDraftLive = draftStatus === 'in-progress';
  const isActive = phase === 'active';
  const isPreDraft = phase === 'pre-draft';

  let label: string;
  let bg: string;
  let textColor: string;
  let showDot = false;
  let dotPulse = false;

  if (isDraftLive) {
    label = 'Draft Live';
    bg = withAlpha(BRAND_SEAM_RED, 0.15);
    textColor = BRAND_SEAM_RED_LIGHT;
    showDot = true;
    dotPulse = true;
  } else if (isActive && hasMatchup) {
    label = 'Active · Live';
    bg = withAlpha(GREEN, 0.12);
    textColor = GREEN_LIGHTER;
    showDot = true;
    dotPulse = true;
  } else if (isActive) {
    label = 'Active';
    bg = withAlpha(GREEN, 0.12);
    textColor = GREEN_LIGHTER;
  } else if (isPreDraft) {
    label = 'Pre-Draft';
    bg = withAlpha(BRAND_GOLD, 0.12);
    textColor = BRAND_GOLD_LIGHT;
  } else {
    label = 'Offseason';
    bg = withAlpha(TEXT_TERTIARY, 0.1);
    textColor = TEXT_TERTIARY;
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: 9999,
        background: bg,
        border: `1px solid ${withAlpha(textColor, 0.4)}`,
        fontFamily: 'Big Shoulders Display, system-ui, sans-serif',
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: textColor,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {showDot && (
        <span
          className={dotPulse ? 'ls-dot-pulse' : undefined}
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: textColor,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}

/* ─── Hero card right panel ─── */

function HeroRightPanel({
  summary,
  userInits,
}: {
  summary: UserLeagueSummaryFragment;
  userInits: string;
}) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';

  const wins = summary.wins ?? 0;
  const losses = summary.losses ?? 0;
  const ties = summary.ties ?? 0;
  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

  const panelBase: React.CSSProperties = {
    background: withAlpha(BG_DARK, 0.55),
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 16,
    padding: '20px 22px',
  };

  if (isDraftLive) {
    return (
      <div
        style={{
          ...panelBase,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 800,
            fontSize: 28,
            color: BRAND_SEAM_RED_LIGHT,
            lineHeight: 1,
          }}
        >
          Draft in Progress
        </div>
        {summary.draftMode && (
          <div
            style={{
              fontFamily: 'Literata, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 15,
              color: TEXT_SECONDARY,
            }}
          >
            {summary.draftMode === 'snake' ? 'Snake draft' : summary.draftMode}
            {summary.selectionMethod === 'auto' ? ' · Auto-pick' : ''}
          </div>
        )}
      </div>
    );
  }

  if (hasMatchup) {
    const userScore = summary.userScore ?? 0;
    const oppScore = summary.opponentScore ?? 0;
    const isLeading = userScore >= oppScore;
    const oppInits = teamInitials(summary.opponentTeamName);

    return (
      <div className="ls-matchup-grid" style={panelBase}>
        {/* User side */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_GOLD} 100%)`,
              border: `1px solid ${withAlpha(BRAND_GOLD, 0.5)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 800,
              fontSize: 18,
              color: WHITE,
            }}
          >
            {userInits}
          </div>
          <div
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: TEXT_INTERFACE,
            }}
          >
            My Team
          </div>
          <div
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              fontSize: isLeading ? 52 : 44,
              lineHeight: 1,
              color: isLeading ? BRAND_GOLD_LIGHT : TEXT_INTERFACE,
            }}
          >
            {userScore.toFixed(1)}
          </div>
        </div>

        {/* VS */}
        <div
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: '0.22em',
            color: TEXT_TERTIARY,
            textAlign: 'center',
          }}
        >
          VS
        </div>

        {/* Opponent side */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${BRAND_SEAM_RED} 0%, ${withAlpha(BRAND_SEAM_RED, 0.3)} 100%)`,
              border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 800,
              fontSize: 18,
              color: WHITE,
            }}
          >
            {oppInits}
          </div>
          <div
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: TEXT_INTERFACE,
              maxWidth: 90,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {summary.opponentTeamName ?? 'Opponent'}
          </div>
          <div
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              fontSize: !isLeading ? 52 : 44,
              lineHeight: 1,
              color: !isLeading ? BRAND_GOLD_LIGHT : TEXT_INTERFACE,
            }}
          >
            {oppScore.toFixed(1)}
          </div>
        </div>
      </div>
    );
  }

  /* No matchup: record + rank, or draft date */
  return (
    <div
      style={{
        ...panelBase,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {isPreDraft && summary.draftScheduledAt ? (
        <>
          <div
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 800,
              fontSize: 34,
              color: BRAND_GOLD_LIGHT,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {formatDraftDate(summary.draftScheduledAt)}
          </div>
          <div
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: TEXT_SECONDARY,
            }}
          >
            Draft Scheduled
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                fontFamily: 'Big Shoulders Display, system-ui',
                fontWeight: 800,
                fontSize: 40,
                color: BRAND_GOLD_LIGHT,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {record}
            </div>
            <div
              style={{
                fontFamily: 'Big Shoulders Display, system-ui',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: TEXT_SECONDARY,
              }}
            >
              Record
            </div>
          </div>
          {summary.rank != null && summary.totalTeams != null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{
                  fontFamily: 'Big Shoulders Display, system-ui',
                  fontWeight: 800,
                  fontSize: 40,
                  color: TEXT_INTERFACE,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                #{summary.rank}
                <span style={{ fontSize: 20, color: TEXT_TERTIARY }}>
                  /{summary.totalTeams}
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'Big Shoulders Display, system-ui',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: TEXT_SECONDARY,
                }}
              >
                Rank
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Hero League Card ─── */

function LeagueHeroCard({
  summary,
  onPress,
  userInits,
}: {
  summary: UserLeagueSummaryFragment;
  onPress: () => void;
  userInits: string;
}) {
  const isPreDraft = summary.leaguePhase === 'pre-draft';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const rank = summary.rank;

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(e) => e.key === 'Enter' && onPress()}
      aria-label={`Open ${summary.leagueName ?? 'League'}`}
      className="ls-hero-grid"
      style={{
        position: 'relative',
        borderRadius: 24,
        overflow: 'hidden',
        background: `
          linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.35)} 0%, transparent 55%),
          linear-gradient(180deg, ${withAlpha(BRAND_GOLD, 0.05)}, transparent 45%),
          ${SURFACE_DEEP}
        `,
        border: `1px solid ${withAlpha(BRAND_GOLD, 0.22)}`,
        boxShadow: `0 12px 32px ${withAlpha(BG_DARK, 0.65)}`,
        padding: 32,
        cursor: 'pointer',
      }}
    >
      {/* Corner glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -120,
          right: -120,
          width: 360,
          height: 360,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${withAlpha(BRAND_GOLD, 0.18)} 0%, transparent 65%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Left: league info */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minWidth: 0,
        }}
      >
        {/* Badge row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <PhaseChip
            phase={summary.leaguePhase}
            draftStatus={summary.draftStatus}
            hasMatchup={hasMatchup}
          />
          {rank === 1 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 11px',
                borderRadius: 9999,
                background: withAlpha(BRAND_GOLD, 0.12),
                border: `1px solid ${withAlpha(BRAND_GOLD, 0.4)}`,
                fontFamily: 'Big Shoulders Display, system-ui',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: BRAND_GOLD_LIGHT,
                flexShrink: 0,
              }}
            >
              Rank&nbsp;#1
            </span>
          )}
        </div>

        {/* League name */}
        <h3
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 800,
            fontSize: 36,
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: WHITE,
            margin: 0,
          }}
        >
          {summary.leagueName ?? 'League'}
        </h3>

        {/* Footer meta */}
        <div
          style={{
            display: 'flex',
            gap: 18,
            alignItems: 'center',
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: TEXT_SECONDARY,
            flexWrap: 'wrap',
          }}
        >
          {summary.currentWeekNumber != null &&
            summary.totalMatchups != null && (
              <span>
                Week{' '}
                <b style={{ color: TEXT_INTERFACE }}>
                  {summary.currentWeekNumber}
                </b>
                /{summary.totalMatchups}
              </span>
            )}
          {summary.teamCount != null && (
            <>
              <span style={{ color: TEXT_SEPARATOR }}>·</span>
              <span>
                <b style={{ color: TEXT_INTERFACE }}>{summary.teamCount}</b>{' '}
                teams
              </span>
            </>
          )}
          {isPreDraft && summary.draftScheduledAt && (
            <>
              <span style={{ color: TEXT_SEPARATOR }}>·</span>
              <span>
                Draft:{' '}
                <b style={{ color: TEXT_INTERFACE }}>
                  {formatDraftDate(summary.draftScheduledAt)}
                </b>
              </span>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPress();
            }}
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '11px 20px',
              borderRadius: 12,
              background: BRAND_GOLD,
              color: BG_DARK,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 150ms ease, transform 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = BRAND_GOLD_LIGHT;
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = BRAND_GOLD;
              e.currentTarget.style.transform = '';
            }}
          >
            View League
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPress();
            }}
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '11px 20px',
              borderRadius: 12,
              background: 'transparent',
              color: TEXT_INTERFACE,
              border: `1px solid ${BORDER_STRONG}`,
              cursor: 'pointer',
              transition: 'border-color 150ms ease, background 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = BORDER_INTERACTIVE;
              e.currentTarget.style.background = withAlpha(WHITE, 0.03);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BORDER_STRONG;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Set Lineup
          </button>
        </div>
      </div>

      {/* Right: matchup / status panel */}
      <HeroRightPanel summary={summary} userInits={userInits} />
    </article>
  );
}

/* ─── League List Row ─── */

function LeagueListRow({
  summary,
  onPress,
}: {
  summary: UserLeagueSummaryFragment;
  onPress: () => void;
}) {
  const isDraftLive = summary.draftStatus === 'in-progress';
  const hasMatchup =
    summary.matchupId != null && summary.matchupStatus === 'in_progress';
  const isPreDraft = summary.leaguePhase === 'pre-draft';

  const wins = summary.wins ?? 0;
  const losses = summary.losses ?? 0;
  const ties = summary.ties ?? 0;
  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

  let scoreBig: string;
  let scoreLabel: string;
  let scoreColor = TEXT_INTERFACE;

  if (isDraftLive) {
    scoreBig = 'Live';
    scoreLabel = summary.draftMode ?? 'Draft';
    scoreColor = BRAND_SEAM_RED_LIGHT;
  } else if (hasMatchup) {
    const userScore = summary.userScore ?? 0;
    const oppScore = summary.opponentScore ?? 0;
    const isLeading = userScore >= oppScore;
    scoreBig = userScore.toFixed(1);
    scoreLabel = `vs ${oppScore.toFixed(1)}${summary.opponentTeamName ? ` ${summary.opponentTeamName}` : ''}`;
    scoreColor = isLeading ? BRAND_GOLD_LIGHT : SCORE_LOSS;
  } else if (isPreDraft && summary.draftScheduledAt) {
    scoreBig = formatDraftDate(summary.draftScheduledAt);
    scoreLabel = 'Draft scheduled';
    scoreColor = BRAND_GOLD_LIGHT;
  } else {
    scoreBig = record;
    scoreLabel =
      summary.rank != null && summary.totalTeams != null
        ? `Rank #${summary.rank} of ${summary.totalTeams}`
        : 'Record';
  }

  let weekLabel: string | null = null;
  if (summary.currentWeekNumber != null && summary.totalMatchups != null) {
    weekLabel = `Week\n${summary.currentWeekNumber}/${summary.totalMatchups}`;
  } else if (summary.teamCount != null) {
    weekLabel = `${summary.teamCount}\nteams`;
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(e) => e.key === 'Enter' && onPress()}
      aria-label={`Open ${summary.leagueName ?? 'League'}`}
      className="ls-league-row-grid"
      style={{
        background: SURFACE_CARD,
        padding: '18px 22px',
        cursor: 'pointer',
        transition: 'background 150ms ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = SURFACE_HOVER)}
      onMouseLeave={(e) => (e.currentTarget.style.background = SURFACE_CARD)}
    >
      {/* Name */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 700,
            fontSize: 18,
            color: TEXT_INTERFACE,
            letterSpacing: '-0.005em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summary.leagueName ?? 'League'}
        </div>
        {summary.teamCount != null && (
          <div
            style={{
              fontFamily: 'Literata, Georgia, serif',
              fontStyle: 'italic',
              fontSize: 13,
              color: TEXT_SECONDARY,
            }}
          >
            {summary.teamCount} teams
          </div>
        )}
      </div>

      {/* Phase chip */}
      <div>
        <PhaseChip
          phase={summary.leaguePhase}
          draftStatus={summary.draftStatus}
          hasMatchup={hasMatchup}
        />
      </div>

      {/* Score / record */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 22,
            color: scoreColor,
            lineHeight: 1,
          }}
        >
          {scoreBig}
        </div>
        <div
          style={{
            fontFamily: 'Literata, Georgia, serif',
            fontSize: 12,
            color: TEXT_SECONDARY,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {scoreLabel}
        </div>
      </div>

      {/* Week / teams */}
      {weekLabel ? (
        <div
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: TEXT_SECONDARY,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'pre-line',
            textAlign: 'right',
          }}
        >
          {weekLabel}
        </div>
      ) : (
        <div />
      )}

      {/* Chevron */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={TEXT_TERTIARY}
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </div>
  );
}

/* ─── Loading skeleton ─── */

function Skel({
  width,
  height,
  borderRadius = 6,
  style,
}: {
  width?: number | string;
  height: number | string;
  borderRadius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="ls-skel"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
    />
  );
}

function ReturningLoadingSkeleton() {
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Page head skeleton */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 24,
          paddingBottom: 24,
          marginBottom: 36,
          borderBottom: `1px solid ${PANEL_BORDER}`,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skel width={90} height={11} />
          <Skel width={320} height={44} />
          <Skel width={260} height={13} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skel width={140} height={42} borderRadius={12} />
          <Skel width={160} height={42} borderRadius={12} />
        </div>
      </div>

      {/* Dashboard split skeleton */}
      <div className="ls-dashboard-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Hero skeleton */}
          <div
            className="ls-hero-grid"
            style={{
              border: `1px solid ${PANEL_BORDER}`,
              borderRadius: 24,
              padding: 32,
              background: SURFACE_PANEL,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Skel width={120} height={22} borderRadius={9999} />
              <Skel width="80%" height={32} style={{ marginTop: 6 }} />
              <Skel width="70%" height={14} />
              <Skel width="60%" height={14} />
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <Skel width={140} height={40} borderRadius={12} />
                <Skel width={120} height={40} borderRadius={12} />
              </div>
            </div>
            <Skel width="100%" height={180} borderRadius={16} />
          </div>

          {/* List row skeletons */}
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                background: SURFACE_CARD,
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 12,
                padding: '20px 22px',
                display: 'grid',
                gridTemplateColumns: '1.6fr 1fr 1fr',
                gap: 24,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Skel width="65%" height={18} />
                <Skel width="45%" height={12} />
              </div>
              <Skel width={80} height={22} borderRadius={9999} />
              <Skel width={100} height={22} />
            </div>
          ))}
        </div>

        {/* Rail skeleton */}
        <div
          style={{
            background: SURFACE_PANEL,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 16,
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <Skel width="70%" height={18} />
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <Skel width={56} height={12} />
              <Skel width="92%" height={14} />
              <Skel width="70%" height={14} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewUserLoadingSkeleton() {
  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Hero skeleton */}
      <div
        style={{
          paddingBottom: 32,
          marginBottom: 40,
          borderBottom: `1px solid ${PANEL_BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <Skel width={120} height={12} />
        <Skel width="70%" height={56} />
        <Skel width="60%" height={20} />
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <Skel width={140} height={42} borderRadius={12} />
          <Skel width={140} height={42} borderRadius={12} />
          <Skel width={140} height={42} borderRadius={12} />
        </div>
      </div>
      {/* Sports grid skeleton */}
      <Skel width={140} height={12} />
      <Skel width={280} height={32} style={{ margin: '6px 0 16px' }} />
      <div className="ls-sport-grid">
        <Skel height={260} borderRadius={20} />
        <Skel height={260} borderRadius={20} />
      </div>
      {/* OTD skeleton */}
      <div style={{ marginTop: 56 }}>
        <Skel width={240} height={32} style={{ marginBottom: 16 }} />
        <div className="ls-otd-grid">
          <Skel height={180} borderRadius={16} />
          <Skel height={180} borderRadius={16} />
        </div>
      </div>
    </div>
  );
}

/* ─── Section header ─── */

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontFamily: 'Big Shoulders Display, system-ui',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: BRAND_GOLD_LIGHT,
        }}
      >
        {eyebrow}
      </span>
      <h2
        style={{
          fontFamily: 'Big Shoulders Display, system-ui',
          fontWeight: 800,
          fontSize: 32,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: TEXT_INTERFACE,
          margin: 0,
        }}
      >
        {title}
      </h2>
    </div>
  );
}

/* ─── Stats CTA bar ─── */

function StatsCta({
  onPress,
  isNewUser,
}: {
  onPress: () => void;
  isNewUser?: boolean;
}) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.2)}, transparent 65%), ${SURFACE_PANEL}`,
        border: `1px solid ${PANEL_BORDER}`,
        borderRadius: 16,
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          background: withAlpha(BRAND_GOLD, 0.08),
          border: `1px solid ${withAlpha(BRAND_GOLD, 0.25)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <BrandIconBadge
          name="stats"
          size={56}
          iconSize={28}
          title="Player statistics"
          decorative={false}
          rounded="square"
        />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: '0.01em',
            color: TEXT_INTERFACE,
            marginBottom: 4,
          }}
        >
          {isNewUser
            ? 'Or just browse a century of data'
            : 'Explore player statistics'}
        </div>
        <p
          style={{
            fontFamily: 'Literata, Georgia, serif',
            fontSize: 14,
            color: TEXT_SECONDARY,
            margin: 0,
            maxWidth: '70ch',
          }}
        >
          {isNewUser
            ? 'Not ready to commit to a league yet? Every box score since 1876 is here to read.'
            : 'Every recorded at-bat since 1876. Filter by era, team, or the night a record fell.'}
        </p>
      </div>
      <button
        onClick={onPress}
        style={{
          fontFamily: 'Big Shoulders Display, system-ui',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '11px 20px',
          borderRadius: 12,
          background: 'transparent',
          color: TEXT_INTERFACE,
          border: `1px solid ${BORDER_STRONG}`,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'border-color 150ms ease',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.borderColor = BORDER_INTERACTIVE)
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.borderColor = BORDER_STRONG)
        }
      >
        View All Stats
      </button>
    </div>
  );
}

/* ─── Error card ─── */

function formatUtcTime(d: Date): string {
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss} UTC`;
}

// Stable 8-char id derived from the error message so retries preserve the
// reference until a different error is seen.
function shortErrorId(message: string): string {
  let h = 2166136261;
  for (let i = 0; i < message.length; i++) {
    h = (h ^ message.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `req_${h.toString(16).padStart(8, '0').slice(0, 8)}`;
}

function ErrorCard({
  onRetry,
  reference,
  occurredAt,
}: {
  onRetry: () => void;
  reference?: string;
  occurredAt?: Date;
}) {
  return (
    <section
      role="alert"
      aria-live="assertive"
      style={{
        background: SURFACE_PANEL,
        border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.35)}`,
        borderRadius: 20,
        padding: 40,
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
        boxShadow: `0 0 0 1px ${withAlpha(BRAND_SEAM_RED, 0.45)}, 0 6px 20px ${withAlpha(BRAND_SEAM_RED, 0.3)}`,
        flexWrap: 'wrap',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: withAlpha(BRAND_SEAM_RED, 0.15),
          border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: BRAND_SEAM_RED_LIGHT,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.3 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4" />
          <path d="M12 17.01V17" />
        </svg>
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          minWidth: 200,
        }}
      >
        <h2
          style={{
            fontFamily: 'Big Shoulders Display, system-ui',
            fontWeight: 800,
            fontSize: 26,
            color: TEXT_INTERFACE,
            margin: 0,
          }}
        >
          Unable to load your leagues
        </h2>
        <p
          style={{
            fontFamily: 'Literata, Georgia, serif',
            fontSize: 15,
            color: TEXT_SECONDARY,
            margin: 0,
            maxWidth: '60ch',
          }}
        >
          We couldn&apos;t reach the league server. Your standings and matchups
          are safe — this is a display issue only. Try again, or come back in a
          moment.
        </p>
        {(reference || occurredAt) && (
          <div
            style={{
              fontFamily: 'Literata, Georgia, serif',
              fontSize: 13,
              color: TEXT_SECONDARY,
              marginTop: 4,
            }}
          >
            {reference && (
              <>
                Reference{' '}
                <code
                  style={{
                    fontFamily:
                      'JetBrains Mono, ui-monospace, Menlo, monospace',
                    fontSize: 12,
                    color: TEXT_INTERFACE,
                    background: withAlpha(BRAND_SEAM_RED, 0.12),
                    border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.3)}`,
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  {reference}
                </code>
              </>
            )}
            {reference && occurredAt && (
              <span style={{ color: TEXT_SEPARATOR, margin: '0 8px' }}>·</span>
            )}
            {occurredAt && (
              <span
                style={{
                  fontFamily: 'JetBrains Mono, ui-monospace, Menlo, monospace',
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  color: TEXT_INTERFACE,
                }}
              >
                {formatUtcTime(occurredAt)}
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={onRetry}
            style={{
              fontFamily: 'Big Shoulders Display, system-ui',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '11px 20px',
              borderRadius: 12,
              background: BRAND_NAVY,
              color: WHITE,
              border: `1px solid ${BRAND_NAVY_LIGHT}`,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─── HomePage ─── */

/**
 * Home Page — Landing page for the web application.
 *
 * Renders one of two views: returning-user dashboard (with leagues)
 * or getting-started view for new users with no leagues yet.
 * Handles loading and error states at the top level.
 */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = auth?.user?.id;
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [errorMeta, setErrorMeta] = useState<{
    message: string;
    occurredAt: Date;
  } | null>(null);
  const { resolvedTheme } = useThemeContext();
  const isLight = resolvedTheme === 'light';

  /* Inject page-scoped CSS once (animations, grid layouts) */
  useEffect(() => {
    const id = 'ls-homepage-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        @keyframes ls-dot-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.35; transform:scale(.85); } }
        @keyframes ls-shimmer { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
        .ls-dot-pulse { animation: ls-dot-pulse 1.4s ease infinite; }
        .ls-skel { background: linear-gradient(90deg, rgba(255,255,255,.03) 0%, rgba(255,255,255,.08) 40%, rgba(255,255,255,.03) 80%); background-size: 800px 100%; animation: ls-shimmer 1.4s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .ls-skel { animation: none; } .ls-dot-pulse { animation: none; } }
        .ls-hero-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 32px; align-items: center; }
        @media (max-width: 768px) { .ls-hero-grid { grid-template-columns: 1fr; } }
        .ls-matchup-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: center; }
        .ls-dashboard-split { display: grid; grid-template-columns: 1fr 360px; gap: 32px; align-items: start; margin-top: 48px; }
        @media (max-width: 1024px) { .ls-dashboard-split { grid-template-columns: 1fr; } }
        .ls-league-row-grid { display: grid; grid-template-columns: minmax(180px, 1.6fr) 1fr 1fr auto auto; gap: 24px; align-items: center; }
        @media (max-width: 768px) { .ls-league-row-grid { grid-template-columns: 1fr auto; gap: 12px; } }
        .ls-sport-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 640px) { .ls-sport-grid { grid-template-columns: 1fr; } }
        .ls-otd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 640px) { .ls-otd-grid { grid-template-columns: 1fr; } }
        .ls-rail { position: sticky; top: 88px; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const sportCardBg = (
    accentBase: string,
    accentAlpha: number,
  ): React.CSSProperties => ({
    background: isLight
      ? `linear-gradient(135deg, ${BG_LIGHT} 0%, ${withAlpha(accentBase, 0.18)} 100%)`
      : `linear-gradient(135deg, ${BG_DARK} 0%, ${withAlpha(accentBase, accentAlpha)} 100%)`,
  });

  const defaultSport = useMemo(() => readDefaultSport(), []);
  const defaultSportRoute =
    defaultSport === 'football' ? '/football' : '/baseball';
  const orderedSports = useMemo(
    () =>
      defaultSport === 'baseball'
        ? SPORTS
        : [...SPORTS].sort((a, b) => {
            if (a.key === defaultSport && b.key !== defaultSport) return -1;
            if (b.key === defaultSport && a.key !== defaultSport) return 1;
            return 0;
          }),
    [defaultSport],
  );

  const {
    data: summaryData,
    loading: summariesLoading,
    error: summariesError,
    refetch: refetchSummaries,
  } = useGetUserLeagueSummariesQuery({
    skip: !auth?.user,
    fetchPolicy: 'cache-and-network',
  });

  // Capture the moment an error first appears so retries preserve the
  // displayed timestamp while a fresh error resets it.
  useEffect(() => {
    if (!summariesError) {
      if (errorMeta !== null) setErrorMeta(null);
      return;
    }
    const message = summariesError.message || 'unknown';
    if (errorMeta?.message !== message) {
      setErrorMeta({ message, occurredAt: new Date() });
    }
  }, [summariesError, errorMeta]);

  const [fetchArchived, { data: archivedData, loading: archivedLoading }] =
    useGetArchivedUserLeagueSummariesLazyQuery({
      fetchPolicy: 'cache-and-network',
    });

  const handleShowArchived = useCallback(() => {
    setShowArchived(true);
    void fetchArchived();
  }, [fetchArchived]);

  const summaries = summaryData?.getUserLeagueSummaries ?? [];
  const hasLeagues = summaries.length > 0;
  const sortedSummaries = useMemo(
    () => sortByUrgency(summaryData?.getUserLeagueSummaries ?? []),
    [summaryData?.getUserLeagueSummaries],
  );
  const archivedSummaries = archivedData?.getArchivedUserLeagueSummaries ?? [];

  const userName = formatDisplayName(auth?.user?.username || 'Manager');
  const userInits = userInitials(userName);

  const getOnboardingKey = (uid: number) => `ls_onboarding_complete_${uid}`;

  useEffect(() => {
    if (!userId) return;
    if (!hasLeagues && !summariesLoading) {
      const key = getOnboardingKey(userId);
      try {
        const legacyDone = window.localStorage.getItem(
          'ls_onboarding_complete',
        );
        if (legacyDone !== null && (JSON.parse(legacyDone) as boolean)) {
          window.localStorage.setItem(key, JSON.stringify(true));
          window.localStorage.removeItem('ls_onboarding_complete');
          return;
        }
        const stored = window.localStorage.getItem(key);
        const completed =
          stored !== null ? (JSON.parse(stored) as boolean) : false;
        if (!completed) setTutorialOpen(true);
      } catch {
        setTutorialOpen(true);
      }
    }
  }, [userId, hasLeagues, summariesLoading]);

  const handleTutorialClose = () => {
    setTutorialOpen(false);
    if (userId) {
      try {
        window.localStorage.setItem(
          getOnboardingKey(userId),
          JSON.stringify(true),
        );
      } catch {
        // ignore
      }
    }
  };

  /* ─── Loading ─── */
  if (
    auth.isLoading ||
    (!!auth.user && (summariesLoading || (!summaryData && !summariesError)))
  ) {
    return (
      <>
        <PageMeta
          title="Dashboard"
          description="Your personalized fantasy sports dashboard."
        />
        <PageContainer style={pageBackgroundStyle}>
          <ContentContainer>
            {summaryData?.getUserLeagueSummaries?.length === 0 ? (
              <NewUserLoadingSkeleton />
            ) : (
              <ReturningLoadingSkeleton />
            )}
          </ContentContainer>
        </PageContainer>
      </>
    );
  }

  /* ─── Error ─── */
  if (
    summariesError &&
    !summariesLoading &&
    !summaryData?.getUserLeagueSummaries
  ) {
    const errorMessage = summariesError.message || 'unknown';
    const errorReference = shortErrorId(errorMessage);
    const errorOccurredAt =
      errorMeta?.message === errorMessage ? errorMeta.occurredAt : new Date();
    return (
      <>
        <PageMeta
          title="Dashboard"
          description="Your personalized fantasy sports dashboard."
        />
        <PageContainer style={pageBackgroundStyle}>
          <ContentContainer>
            {/* Greeting header */}
            <div
              style={{
                paddingBottom: 24,
                marginBottom: 36,
                borderBottom: `1px solid ${PANEL_BORDER}`,
              }}
            >
              <span
                style={{
                  fontFamily: 'Big Shoulders Display, system-ui',
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: BRAND_GOLD_LIGHT,
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Welcome back
              </span>
              <h1
                style={{
                  fontFamily: 'Big Shoulders Display, system-ui',
                  fontWeight: 800,
                  fontSize: 'clamp(36px, 4.4vw, 56px)',
                  lineHeight: 1.02,
                  letterSpacing: '-0.02em',
                  color: WHITE,
                  margin: 0,
                }}
              >
                {userName}
              </h1>
            </div>
            <ErrorCard
              onRetry={() => void refetchSummaries()}
              reference={errorReference}
              occurredAt={errorOccurredAt}
            />
            {/* On This Day still available */}
            <div style={{ marginTop: 56 }}>
              <SectionHead
                eyebrow="Still here"
                title="On This Day in Baseball"
              />
              <div style={{ marginTop: 20 }}>
                <OnThisDayFeed
                  onPlayerPress={(id) => navigate(`/players/${id}`)}
                />
              </div>
            </div>
          </ContentContainer>
        </PageContainer>
      </>
    );
  }

  /* ─── Returning user dashboard ─── */
  if (hasLeagues) {
    const heroLeague = sortedSummaries[0];
    const secondaryLeagues = sortedSummaries.slice(1);

    const aggregateWins = sortedSummaries
      .filter((s) => s.leaguePhase === 'active')
      .reduce((acc, s) => acc + (s.wins ?? 0), 0);
    const aggregateLosses = sortedSummaries
      .filter((s) => s.leaguePhase === 'active')
      .reduce((acc, s) => acc + (s.losses ?? 0), 0);
    const aggregateTies = sortedSummaries
      .filter((s) => s.leaguePhase === 'active')
      .reduce((acc, s) => acc + (s.ties ?? 0), 0);
    const hasActive = sortedSummaries.some((s) => s.leaguePhase === 'active');
    const firstPlaceCount = sortedSummaries.filter((s) => s.rank === 1).length;

    const aggregateRecord = hasActive
      ? aggregateTies > 0
        ? `${aggregateWins}-${aggregateLosses}-${aggregateTies}`
        : `${aggregateWins}-${aggregateLosses}`
      : null;

    return (
      <>
        <PageMeta
          title="Dashboard"
          description="Your personalized fantasy sports dashboard."
        />
        <PageContainer style={pageBackgroundStyle}>
          <ContentContainer>
            {/* ── Compact header ── */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 24,
                paddingBottom: 24,
                borderBottom: `1px solid ${PANEL_BORDER}`,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: 'Big Shoulders Display, system-ui',
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: BRAND_GOLD_LIGHT,
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Welcome back
                </span>
                <h1
                  style={{
                    fontFamily: 'Big Shoulders Display, system-ui',
                    fontWeight: 800,
                    fontSize: 'clamp(36px, 4.4vw, 56px)',
                    lineHeight: 1.02,
                    letterSpacing: '-0.02em',
                    color: WHITE,
                    margin: '0 0 10px',
                  }}
                >
                  {userName}
                </h1>
                {/* Record line */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontFamily: 'Big Shoulders Display, system-ui',
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: TEXT_SECONDARY,
                    fontVariantNumeric: 'tabular-nums',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <b style={{ color: TEXT_INTERFACE }}>{summaries.length}</b>{' '}
                    {summaries.length === 1 ? 'league' : 'leagues'}
                  </span>
                  {aggregateRecord && (
                    <>
                      <span style={{ color: TEXT_SEPARATOR }}>·</span>
                      <span>
                        Overall{' '}
                        <b style={{ color: TEXT_INTERFACE }}>
                          {aggregateRecord}
                        </b>
                      </span>
                    </>
                  )}
                  {firstPlaceCount > 0 && (
                    <>
                      <span style={{ color: TEXT_SEPARATOR }}>·</span>
                      <span>
                        <b style={{ color: TEXT_INTERFACE }}>
                          {firstPlaceCount}
                        </b>{' '}
                        first place
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={() => navigate('/players/stats')}
                  style={{
                    fontFamily: 'Big Shoulders Display, system-ui',
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '11px 20px',
                    borderRadius: 12,
                    background: 'transparent',
                    color: TEXT_INTERFACE,
                    border: `1px solid ${BORDER_STRONG}`,
                    cursor: 'pointer',
                  }}
                >
                  Browse Stats
                </button>
                <button
                  onClick={() => navigate(defaultSportRoute)}
                  style={{
                    fontFamily: 'Big Shoulders Display, system-ui',
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '11px 20px',
                    borderRadius: 12,
                    background: BRAND_NAVY,
                    color: WHITE,
                    border: `1px solid ${BRAND_NAVY_LIGHT}`,
                    cursor: 'pointer',
                  }}
                >
                  My Dashboard
                </button>
              </div>
            </div>

            {/* ── Dashboard split: main + right rail ── */}
            <div className="ls-dashboard-split">
              {/* Main column */}
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 48 }}
              >
                {/* Your Leagues */}
                <section>
                  <div style={{ marginBottom: 20 }}>
                    <SectionHead eyebrow="Active Season" title="Your Leagues" />
                  </div>

                  {/* Hero card */}
                  <LeagueHeroCard
                    summary={heroLeague}
                    onPress={() => navigate(leagueDetailRoute(heroLeague))}
                    userInits={userInits}
                  />

                  {/* Secondary leagues list */}
                  {secondaryLeagues.length > 0 && (
                    <div
                      role="list"
                      aria-label="Other leagues"
                      style={{
                        marginTop: 20,
                        border: `1px solid ${PANEL_BORDER}`,
                        borderRadius: 12,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        background: PANEL_BORDER,
                      }}
                    >
                      {secondaryLeagues.map((s) => (
                        <LeagueListRow
                          key={s.leagueId}
                          summary={s}
                          onPress={() => navigate(leagueDetailRoute(s))}
                        />
                      ))}
                    </div>
                  )}

                  {/* Archived leagues toggle */}
                  {!showArchived ? (
                    <button
                      type="button"
                      onClick={handleShowArchived}
                      style={{
                        marginTop: 16,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'transparent',
                        border: `1px dashed ${PANEL_BORDER}`,
                        color: TEXT_SECONDARY,
                        fontFamily: 'Big Shoulders Display, system-ui',
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '10px 16px',
                        borderRadius: 9999,
                        cursor: 'pointer',
                        transition: 'color 150ms ease, border-color 150ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = TEXT_INTERFACE;
                        e.currentTarget.style.borderColor = BORDER_STRONG;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = TEXT_SECONDARY;
                        e.currentTarget.style.borderColor = PANEL_BORDER;
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      Show archived leagues
                    </button>
                  ) : archivedLoading ? (
                    <XStack gap="$2" alignItems="center" marginTop="$4">
                      <Spinner size="small" color="$brandGoldLight" />
                      <Text fontSize="$3" color="$textMuted">
                        Loading archived leagues…
                      </Text>
                    </XStack>
                  ) : archivedSummaries.length > 0 ? (
                    <div style={{ marginTop: 24 }}>
                      <div
                        style={{
                          fontFamily: 'Big Shoulders Display, system-ui',
                          fontWeight: 700,
                          fontSize: 14,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: TEXT_SECONDARY,
                          marginBottom: 12,
                        }}
                      >
                        Archived
                      </div>
                      <div
                        role="list"
                        style={{
                          border: `1px solid ${PANEL_BORDER}`,
                          borderRadius: 12,
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                          background: PANEL_BORDER,
                        }}
                      >
                        {archivedSummaries.map((s) => (
                          <LeagueListRow
                            key={s.leagueId}
                            summary={s}
                            onPress={() => navigate(leagueDetailRoute(s))}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* Your Sports */}
                <section>
                  <SectionHead eyebrow="Your Sports" title="Pick your sport" />
                  <div className="ls-sport-grid" style={{ marginTop: 20 }}>
                    {SPORTS.map((sport) => (
                      <div
                        key={sport.key}
                        role={sport.available ? 'link' : undefined}
                        tabIndex={sport.available ? 0 : undefined}
                        onClick={() =>
                          sport.available ? navigate(sport.route) : undefined
                        }
                        onKeyDown={(e) =>
                          sport.available && e.key === 'Enter'
                            ? navigate(sport.route)
                            : undefined
                        }
                        aria-label={
                          sport.available
                            ? `Go to ${sport.title}`
                            : `${sport.title} — Coming Soon`
                        }
                        style={{
                          ...sportCardBg(sport.accentBase, sport.accentAlpha),
                          position: 'relative',
                          padding: 28,
                          borderRadius: 20,
                          border: `1px solid rgba(255,255,255,0.08)`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 20,
                          cursor: sport.available ? 'pointer' : 'default',
                          opacity: sport.available ? 1 : 0.6,
                          transition:
                            'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
                          textDecoration: 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (!sport.available) return;
                          e.currentTarget.style.transform = 'translateY(-3px)';
                          e.currentTarget.style.borderColor = withAlpha(
                            BRAND_GOLD,
                            0.35,
                          );
                          e.currentTarget.style.boxShadow = `0 12px 32px rgba(8,12,20,0.65)`;
                        }}
                        onMouseLeave={(e) => {
                          if (!sport.available) return;
                          e.currentTarget.style.transform = '';
                          e.currentTarget.style.borderColor =
                            'rgba(255,255,255,0.08)';
                          e.currentTarget.style.boxShadow = '';
                        }}
                      >
                        {!sport.available && (
                          <span
                            style={{
                              position: 'absolute',
                              top: 16,
                              right: 16,
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '5px 11px',
                              borderRadius: 9999,
                              background: 'rgba(200,148,82,.10)',
                              border: `1px solid rgba(200,148,82,.35)`,
                              fontFamily: 'Big Shoulders Display, system-ui',
                              fontWeight: 700,
                              fontSize: 11,
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              color: AMBER_WARM,
                            }}
                          >
                            Coming Soon
                          </span>
                        )}
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 12,
                            background: withAlpha(BG_DARK, 0.55),
                            border: `1px solid ${PANEL_BORDER}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <BrandIcon
                            name={sport.icon}
                            size={36}
                            title={sport.title}
                            decorative={false}
                          />
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            minWidth: 0,
                          }}
                        >
                          <div
                            data-testid={`sport-card-title-${sport.key}`}
                            style={{
                              fontFamily: 'Big Shoulders Display, system-ui',
                              fontWeight: 800,
                              fontSize: 26,
                              letterSpacing: '-0.005em',
                              color: WHITE,
                            }}
                          >
                            {sport.title}
                          </div>
                          <div
                            style={{
                              fontFamily: 'Literata, Georgia, serif',
                              fontSize: 14,
                              color: TEXT_SECONDARY,
                            }}
                          >
                            {sport.description}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Stats CTA */}
                <section>
                  <StatsCta onPress={() => navigate('/players/stats')} />
                </section>
              </div>

              {/* Right rail */}
              <aside className="ls-rail" aria-label="On This Day in Baseball">
                <div
                  style={{
                    background: SURFACE_PANEL,
                    border: `1px solid ${PANEL_BORDER}`,
                    borderRadius: 16,
                    padding: 22,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  <OnThisDayFeed
                    onPlayerPress={(id) => navigate(`/players/${id}`)}
                  />
                </div>
              </aside>
            </div>
          </ContentContainer>
        </PageContainer>
      </>
    );
  }

  /* ─── Getting-started view (new users) ─── */
  return (
    <>
      {tutorialOpen && <OnboardingTutorial onClose={handleTutorialClose} />}
      <PageMeta
        title="Fantasy Baseball League Manager"
        description="Manage your fantasy baseball leagues, draft players, track live stats, and compete with friends on Legacy Sports."
      />
      <PageContainer style={pageBackgroundStyle}>
        <ContentContainer>
          {/* Editorial hero */}
          <div
            style={{
              paddingBottom: 32,
              marginBottom: 40,
              borderBottom: `1px solid ${PANEL_BORDER}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            <span
              style={{
                fontFamily: 'Big Shoulders Display, system-ui',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: BRAND_GOLD_LIGHT,
              }}
            >
              Welcome, {userName}
            </span>
            <h1
              style={{
                fontFamily: 'Big Shoulders Display, system-ui',
                fontWeight: 800,
                fontSize: 'clamp(44px, 5.2vw, 68px)',
                lineHeight: 0.98,
                letterSpacing: '-0.025em',
                color: WHITE,
                margin: 0,
              }}
            >
              Start your dynasty.
              <br />
              <span style={{ color: BRAND_GOLD_LIGHT }}>
                Draft legends across every era.
              </span>
            </h1>
            <p
              style={{
                fontFamily: 'Literata, Georgia, serif',
                fontSize: 18,
                lineHeight: 1.55,
                color: TEXT_SECONDARY,
                margin: 0,
                maxWidth: '60ch',
              }}
            >
              Create a league in sixty seconds. Invite ten friends, pick an era,
              and compete on real archived statistics — from Deadball to today.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginTop: 14,
                flexWrap: 'wrap',
              }}
            >
              <button
                onClick={() => navigate(CREATE_BASEBALL_LEAGUE_ROUTE)}
                style={{
                  fontFamily: 'Big Shoulders Display, system-ui',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '11px 20px',
                  borderRadius: 12,
                  background: BRAND_GOLD,
                  color: BG_DARK,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Create League
              </button>
              <button
                onClick={() => navigate(JOIN_BASEBALL_LEAGUE_ROUTE)}
                style={{
                  fontFamily: 'Big Shoulders Display, system-ui',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '11px 20px',
                  borderRadius: 12,
                  background: BRAND_NAVY,
                  color: WHITE,
                  border: `1px solid ${BRAND_NAVY_LIGHT}`,
                  cursor: 'pointer',
                }}
              >
                Join League
              </button>
              <button
                onClick={() => setTutorialOpen(true)}
                style={{
                  fontFamily: 'Big Shoulders Display, system-ui',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '11px 20px',
                  borderRadius: 12,
                  background: 'transparent',
                  color: TEXT_INTERFACE,
                  border: `1px solid ${BORDER_STRONG}`,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
                How It Works
              </button>
            </div>
          </div>

          {/* Choose Your Sport */}
          <section>
            <div style={{ marginBottom: 20 }}>
              <SectionHead eyebrow="Step one" title="Choose your sport" />
            </div>
            <div className="ls-sport-grid">
              {orderedSports.map((sport) => (
                <div
                  key={sport.key}
                  aria-disabled={!sport.available}
                  style={{
                    ...sportCardBg(sport.accentBase, sport.accentAlpha),
                    position: 'relative',
                    padding: 32,
                    borderRadius: 20,
                    border: `1px solid rgba(255,255,255,0.08)`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    opacity: sport.available ? 1 : 0.6,
                    cursor: sport.available ? 'default' : 'default',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 12,
                        background: withAlpha(BG_DARK, 0.55),
                        border: `1px solid ${PANEL_BORDER}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <BrandIcon
                        name={sport.icon}
                        size={40}
                        title={sport.title}
                        decorative={false}
                      />
                    </div>
                    {sport.available ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 11px',
                          borderRadius: 9999,
                          background: withAlpha(GREEN, 0.12),
                          border: `1px solid ${withAlpha(GREEN, 0.4)}`,
                          fontFamily: 'Big Shoulders Display, system-ui',
                          fontWeight: 700,
                          fontSize: 11,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: GREEN_LIGHTER,
                        }}
                      >
                        <span
                          className="ls-dot-pulse"
                          style={{
                            display: 'inline-block',
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: GREEN_LIGHTER,
                          }}
                        />
                        Live Season
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '5px 11px',
                          borderRadius: 9999,
                          background: 'rgba(200,148,82,.10)',
                          border: `1px solid rgba(200,148,82,.35)`,
                          fontFamily: 'Big Shoulders Display, system-ui',
                          fontWeight: 700,
                          fontSize: 11,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: AMBER_WARM,
                        }}
                      >
                        Coming Soon
                      </span>
                    )}
                  </div>

                  <div>
                    <div
                      data-testid={`sport-card-title-${sport.key}`}
                      style={{
                        fontFamily: 'Big Shoulders Display, system-ui',
                        fontWeight: 800,
                        fontSize: 32,
                        letterSpacing: '-0.005em',
                        color: WHITE,
                      }}
                    >
                      {sport.title}
                    </div>
                    <div
                      style={{
                        fontFamily: 'Literata, Georgia, serif',
                        fontSize: 15,
                        color: TEXT_SECONDARY,
                        maxWidth: '48ch',
                        marginTop: 4,
                      }}
                    >
                      {sport.description}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      marginTop: 'auto',
                      flexWrap: 'wrap',
                    }}
                  >
                    {sport.available ? (
                      <>
                        <button
                          onClick={() => navigate(CREATE_BASEBALL_LEAGUE_ROUTE)}
                          style={{
                            fontFamily: 'Big Shoulders Display, system-ui',
                            fontWeight: 700,
                            fontSize: 13,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '11px 20px',
                            borderRadius: 12,
                            background: BRAND_GOLD,
                            color: BG_DARK,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Create League
                        </button>
                        <button
                          onClick={() => navigate(sport.route)}
                          style={{
                            fontFamily: 'Big Shoulders Display, system-ui',
                            fontWeight: 700,
                            fontSize: 13,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '11px 20px',
                            borderRadius: 12,
                            background: 'transparent',
                            color: TEXT_INTERFACE,
                            border: `1px solid ${BORDER_STRONG}`,
                            cursor: 'pointer',
                          }}
                        >
                          View Public Leagues
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled
                          style={{
                            fontFamily: 'Big Shoulders Display, system-ui',
                            fontWeight: 700,
                            fontSize: 13,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '11px 20px',
                            borderRadius: 12,
                            background: 'transparent',
                            color: TEXT_INTERFACE,
                            border: `1px solid ${BORDER_STRONG}`,
                            cursor: 'not-allowed',
                            opacity: 0.45,
                          }}
                        >
                          View Leagues
                        </button>
                        <button
                          disabled
                          style={{
                            fontFamily: 'Big Shoulders Display, system-ui',
                            fontWeight: 700,
                            fontSize: 13,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '11px 20px',
                            borderRadius: 12,
                            background: 'transparent',
                            color: TEXT_INTERFACE,
                            border: `1px solid ${BORDER_STRONG}`,
                            cursor: 'not-allowed',
                            opacity: 0.45,
                          }}
                        >
                          Create League
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* On This Day — baseball only */}
          {defaultSport === 'baseball' && (
            <section style={{ marginTop: 56 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <SectionHead
                  eyebrow="Try the archive"
                  title="On This Day in Baseball"
                />
                <button
                  onClick={() => navigate('/players/stats')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Big Shoulders Display, system-ui',
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: BRAND_GOLD_LIGHT,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  Full archive
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <OnThisDayFeed
                onPlayerPress={(id) => navigate(`/players/${id}`)}
              />
            </section>
          )}

          {/* Stats CTA */}
          <section style={{ marginTop: 56 }}>
            <StatsCta onPress={() => navigate('/players/stats')} isNewUser />
          </section>
        </ContentContainer>
      </PageContainer>
    </>
  );
}

export default HomePage;

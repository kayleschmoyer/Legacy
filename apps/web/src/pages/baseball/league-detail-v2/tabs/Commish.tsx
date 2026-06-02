import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  DefensiveFormat,
  type LeagueFragment,
  Sport,
  type TeamFragment,
} from '../../../../api/db/graphql.generated';
import {
  useCurrentWeek,
  useMatchupsForLeague,
} from '../../../../hooks/useMatchup';
import { useLeagueWebSocket } from '../../../../hooks/useLeagueWebSocket';
import { useIsPremium } from '../../../../hooks/useIsPremium';
import { useLeagueScoringSettings } from '../../../../lib/scoring';
import { CommissionerAnnouncementsPanel } from '../../../../features/baseball/CommissionerAnnouncementsPanel';
import { DraftSettingsControl } from '../../../../components/commissioner/DraftSettingsControl';
import { NextStepControl } from '../../../../features/commissioner';
import { LeagueDuesControl } from '../../../../components/commissioner/LeagueDuesControl';
import { LeagueDuesStatusDashboard } from '../../../../components/commissioner/LeagueDuesStatusDashboard';
import { SeasonAwardsControl } from '../../../../components/commissioner/SeasonAwardsControl';
import { LeagueScoringEditor } from '../../../../features/baseball/LeagueScoringEditor';
import { DeleteLeagueControl } from '../../../../features/commissioner/DeleteLeagueControl';
import { LeagueSettingsControl } from '../../../../components/commissioner/LeagueSettingsControl';
import { WaiverProcessControl } from '../../../../features/commissioner';
import { I } from '../Icons';

interface AccordSection {
  id: string;
  label: string;
  iconClass?: 'gold' | 'red' | '';
  icon: React.ReactNode;
  badge?: React.ReactNode;
  content: React.ReactNode;
  testId?: string;
}

const Accord: React.FC<{
  section: AccordSection;
  open: boolean;
  onToggle: () => void;
}> = ({ section, open, onToggle }) => (
  <div className={`ls-accord ${open ? 'open' : ''}`}>
    <button
      type="button"
      className="ls-accord-head"
      onClick={onToggle}
      aria-expanded={open}
      data-testid={section.testId}
    >
      <div className="ls-accord-title">
        <div className={`icon-wrap ${section.iconClass ?? ''}`}>
          {section.icon}
        </div>
        <span className="label">{section.label}</span>
        {section.badge}
      </div>
      <I.ChevronDown className="ls-chev" size={16} />
    </button>
    {open ? (
      <div className="ls-accord-body" role="region" aria-label={section.label}>
        {section.content}
      </div>
    ) : null}
  </div>
);

export interface CommishTabProps {
  league: LeagueFragment;
  teams: readonly TeamFragment[];
  // LS-4542: settings toast state is owned by LeagueDetailPageV2 so it
  // survives a transient CommishTab unmount during the save flow.
  onSettingsSuccess: (msg: string | null) => void;
  onSettingsError: (msg: string | null) => void;
}

export const CommishTab: React.FC<CommishTabProps> = ({
  league,
  teams,
  onSettingsSuccess,
  onSettingsError,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPremium = useIsPremium();
  const isFootball = league.sport === Sport.Football;
  const [openId, setOpenId] = useState<string>('next-step');
  const [nextStepError, setNextStepError] = useState<string | null>(null);
  const [waiverSuccess, setWaiverSuccess] = useState<string | null>(null);
  const [waiverError, setWaiverError] = useState<string | null>(null);
  const leagueId = league.id ?? 0;

  const {
    profile: scoringProfile,
    loading: scoringLoading,
    error: scoringError,
    refetch: refetchScoring,
  } = useLeagueScoringSettings(leagueId);

  // NextStepControl needs the current matchup to render game-selection /
  // advance-week states.  Fetch league matchups + current week and pick
  // any matchup for the current week (NextStep uses league-level fields
  // selectedGamesCount/status/weekNumber, not user-specific).
  const { matchups: allLeagueMatchups, refetch: refetchMatchups } =
    useMatchupsForLeague(leagueId || null);
  const { currentWeek, refetch: refetchCurrentWeek } = useCurrentWeek(
    leagueId || null,
  );
  const currentMatchup = useMemo(() => {
    if (!currentWeek || !allLeagueMatchups.length) return null;
    return allLeagueMatchups.find((m) => m.weekNumber === currentWeek) ?? null;
  }, [allLeagueMatchups, currentWeek]);

  // Refetch when the server signals stats have been recalculated so the
  // NextStepControl label (game-selection vs advance-week) stays in sync
  // without a manual reload.
  const refetchMatchupsRef = useRef(refetchMatchups);
  refetchMatchupsRef.current = refetchMatchups;
  const refetchCurrentWeekRef = useRef(refetchCurrentWeek);
  refetchCurrentWeekRef.current = refetchCurrentWeek;
  useLeagueWebSocket({
    onMatchupStatsComplete: () => {
      void refetchMatchupsRef.current();
      void refetchCurrentWeekRef.current();
    },
  });

  const sections: AccordSection[] = [
    {
      id: 'next-step',
      label: 'Next Step',
      iconClass: 'gold',
      icon: <I.Zap size={16} />,
      badge: (
        <span
          className="ls-chip ls-chip-active"
          style={{ marginLeft: 8, fontSize: 9 }}
        >
          Ready
        </span>
      ),
      content: leagueId ? (
        <NextStepControl
          leagueId={leagueId}
          currentMatchup={currentMatchup}
          gamesPerMatchup={league.gamesPerMatchup ?? 1}
          draftStatus={league.draftStatus}
          leagueName={league.name ?? ''}
          frozenAt={league.frozenAt}
          totalMatchups={league.totalMatchups ?? undefined}
          onError={(err) => setNextStepError(err.message)}
          onSuccess={() => setNextStepError(null)}
          onNavigateToDraftBoard={() =>
            navigate(`/baseball/league/${leagueId}/draft`)
          }
          onNavigateToLeague={(newLeagueId) =>
            navigate(`/baseball/league/${newLeagueId}`)
          }
        />
      ) : null,
    },
    {
      id: 'announcements',
      label: 'Announcements',
      iconClass: 'gold',
      icon: <I.Bell size={16} />,
      content: leagueId ? (
        <CommissionerAnnouncementsPanel leagueId={leagueId} isCommissioner />
      ) : null,
    },
    {
      id: 'league-settings',
      label: 'League Settings',
      iconClass: 'gold',
      icon: <I.Settings size={16} />,
      content: leagueId ? (
        <LeagueSettingsControl
          leagueId={leagueId}
          draftStatus={league.draftStatus}
          currentGamesPerMatchup={league.gamesPerMatchup ?? 1}
          currentSpStartsPerMatchup={league.pitcherStartsPerMatchup ?? 1}
          currentMinCareerGames={league.minCareerGames ?? 50}
          currentMinCareerSeasons={league.minCareerSeasons ?? 3}
          currentTotalMatchups={league.totalMatchups ?? 10}
          currentPlayoffEnabled={league.playoffEnabled ?? true}
          currentPlayoffFormat={league.playoffFormat ?? '4-team'}
          currentPlayoffMultiWeek={league.playoffMultiWeek ?? false}
          currentSalaryCapEnabled={league.salaryCapEnabled ?? false}
          currentSalaryCap={league.salaryCap ?? null}
          isPremium={isPremium}
          onSuccess={(msg) => {
            onSettingsError(null);
            onSettingsSuccess(msg);
          }}
          onError={(err) => {
            onSettingsSuccess(null);
            onSettingsError(err.message);
          }}
        />
      ) : null,
    },
    ...(!isFootball
      ? [
          {
            id: 'draft-settings',
            label: 'Draft Settings',
            iconClass: 'gold' as const,
            icon: <I.Settings size={16} />,
            content: leagueId ? (
              <DraftSettingsControl
                leagueId={leagueId}
                draftStatus={league.draftStatus}
                playerPool={league.playerPool}
                eraFilter={league.eraFilter}
                baseballHofOnly={league.baseballHofOnly}
                customEraStartYear={league.customEraStartYear ?? undefined}
                customEraEndYear={league.customEraEndYear ?? undefined}
              />
            ) : null,
          },
        ]
      : []),
    {
      id: 'dues',
      label: 'League Dues',
      iconClass: 'gold',
      icon: <I.Dollar size={16} />,
      content: leagueId ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LeagueDuesControl leagueId={leagueId} />
          <LeagueDuesStatusDashboard
            leagueId={leagueId}
            isCommissioner
            currentUserId={user?.id}
          />
        </div>
      ) : null,
    },
    {
      id: 'awards',
      label: 'Season Awards',
      iconClass: 'gold',
      icon: <I.Award size={16} />,
      content: leagueId ? (
        <SeasonAwardsControl
          leagueId={leagueId}
          currentSeason={league.seasonNumber ?? new Date().getFullYear()}
        />
      ) : null,
    },
    {
      id: 'scoring',
      label: 'Scoring Rules',
      icon: <I.List size={16} />,
      content: leagueId ? (
        isFootball ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--fg3)',
              fontSize: 13,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--fg2)',
                marginBottom: 6,
                letterSpacing: '.04em',
              }}
            >
              Football Scoring Editor
            </div>
            Football scoring settings (passing, rushing, receiving, kicking
            {league.defensiveFormat === DefensiveFormat.Idp ? ', IDP' : ', DST'}
            ) will be configurable here once the football scoring editor ships.
          </div>
        ) : (
          <LeagueScoringEditor
            leagueId={leagueId}
            profile={scoringProfile}
            loading={scoringLoading}
            error={scoringError ?? null}
            onRefetch={async () => {
              await refetchScoring();
            }}
            draftStatus={league.draftStatus}
          />
        )
      ) : null,
    },
    {
      id: 'waivers',
      label: 'Waiver Processing',
      iconClass: 'gold',
      icon: <I.Refresh size={16} />,
      content: leagueId ? (
        <WaiverProcessControl
          leagueId={leagueId}
          onSuccess={(msg) => {
            setWaiverError(null);
            setWaiverSuccess(msg);
          }}
          onError={(err) => {
            setWaiverSuccess(null);
            setWaiverError(err.message);
          }}
        />
      ) : null,
    },
    {
      id: 'danger',
      label: 'Danger Zone',
      iconClass: 'red',
      icon: <I.AlertTriangle size={16} />,
      testId: 'danger-zone-toggle',
      content: leagueId ? (
        <DeleteLeagueControl
          leagueId={leagueId}
          leagueName={league.name ?? 'this league'}
          teamCount={teams.length}
          seasonNumber={league.seasonNumber ?? undefined}
        />
      ) : null,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {nextStepError ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: 'rgba(196, 30, 58, 0.1)',
            border: '1px solid rgba(196, 30, 58, 0.4)',
            borderRadius: 8,
            padding: 12,
            color: '#c41e3a',
            fontWeight: 600,
          }}
        >
          Error: {nextStepError}
        </div>
      ) : null}
      {waiverError ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: 'rgba(196, 30, 58, 0.1)',
            border: '1px solid rgba(196, 30, 58, 0.4)',
            borderRadius: 8,
            padding: 12,
            color: '#c41e3a',
            fontWeight: 600,
          }}
        >
          Error processing waivers: {waiverError}
        </div>
      ) : null}
      {waiverSuccess ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.4)',
            borderRadius: 8,
            padding: 12,
            color: '#16a34a',
            fontWeight: 600,
          }}
        >
          {waiverSuccess}
        </div>
      ) : null}
      <div className="ls-accordion">
        {sections.map((s) => (
          <Accord
            key={s.id}
            section={s}
            open={openId === s.id}
            onToggle={() => setOpenId(openId === s.id ? '' : s.id)}
          />
        ))}
      </div>
    </div>
  );
};

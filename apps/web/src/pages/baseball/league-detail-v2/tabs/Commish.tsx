import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useStepUpGate } from '@legacy-sports/shared-components/auth';
import {
  type LeagueFragment,
  Sport,
  type TeamFragment,
  useGetCommissionerAuditLogsQuery,
} from '@legacy-sports/graphql';
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
import { ScoringSettingsEditor } from '../../../../components/leagues/ScoringSettingsEditor';
import { DeleteLeagueControl } from '../../../../features/commissioner/DeleteLeagueControl';
import { StepUpModal } from '../../../../components/StepUpModal';
import { LeagueSettingsControl } from '../../../../components/commissioner/LeagueSettingsControl';
import { WaiverProcessControl } from '../../../../features/commissioner';
import { PremiumGate } from '../../../../components/PremiumGate';
import { I } from '../Icons';

interface AccordSection {
  id: string;
  label: string;
  iconClass?: 'gold' | 'red' | '';
  icon: React.ReactNode;
  badge?: React.ReactNode;
  content: React.ReactNode;
  testId?: string;
  disabled?: boolean;
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
      onClick={section.disabled ? undefined : onToggle}
      aria-expanded={section.disabled ? undefined : open}
      aria-disabled={section.disabled}
      data-testid={section.testId}
      style={
        section.disabled
          ? { cursor: 'default', pointerEvents: 'none' }
          : undefined
      }
    >
      <div className="ls-accord-title">
        <div className={`icon-wrap ${section.iconClass ?? ''}`}>
          {section.icon}
        </div>
        <span className="label">{section.label}</span>
        {section.badge}
      </div>
      <I.ChevronDown
        className="ls-chev"
        size={16}
        style={section.disabled ? { opacity: 0.3 } : undefined}
      />
    </button>
    {open ? (
      <div className="ls-accord-body" role="region" aria-label={section.label}>
        {section.content}
      </div>
    ) : null}
  </div>
);

const ACTION_LABELS: Record<string, string> = {
  force_add: 'Force Add',
  force_drop: 'Force Drop',
  lock_team: 'Lock Team',
  unlock_team: 'Unlock Team',
  bulk_drop_players: 'Bulk Drop',
  recalculate_scores: 'Recalculate Scores',
};

const AUDIT_PAGE_SIZE = 25;

function AuditLogPanel({ leagueId }: { leagueId: number }) {
  const [limit, setLimit] = useState(AUDIT_PAGE_SIZE);
  const { data, loading, error } = useGetCommissionerAuditLogsQuery({
    variables: { leagueId, limit },
    fetchPolicy: 'cache-and-network',
  });

  const logs = [...(data?.commissionerAuditLogs ?? [])].sort((a, b) => {
    const dateA = a.createdAt ? new Date(String(a.createdAt)).getTime() : 0;
    const dateB = b.createdAt ? new Date(String(b.createdAt)).getTime() : 0;
    return dateB - dateA;
  });

  const hasMore = logs.length === limit;

  if (loading && logs.length === 0) {
    return (
      <div
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--fg3)',
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '12px 16px', color: '#c41e3a', fontSize: 13 }}>
        Failed to load audit log.
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--fg3)',
          fontSize: 13,
        }}
      >
        No commissioner actions recorded yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {logs.map((log) => (
        <div
          key={log.id}
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border1)',
            borderRadius: 6,
            padding: '10px 12px',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {log.action ? (ACTION_LABELS[log.action] ?? log.action) : ''}
          </div>
          {log.reason ? (
            <div style={{ fontSize: 12, color: 'var(--fg2)', marginTop: 2 }}>
              Reason: {log.reason}
            </div>
          ) : null}
          <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 4 }}>
            {log.createdAt
              ? new Date(String(log.createdAt)).toLocaleString()
              : ''}
          </div>
        </div>
      ))}
      {hasMore ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => setLimit((prev) => prev + AUDIT_PAGE_SIZE)}
          style={{
            marginTop: 4,
            padding: '8px 16px',
            fontSize: 13,
            color: 'var(--fg2)',
            background: 'var(--surface2)',
            border: '1px solid var(--border1)',
            borderRadius: 6,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}

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
  const {
    isPrompting: isStepUpPrompting,
    requireStepUp,
    onVerified: onStepUpVerified,
    onDismiss: onStepUpDismiss,
  } = useStepUpGate();
  const isLeagueOwner = league.owner === user?.id;
  const isAdminUser = user?.accessLevel === 'admin';
  const isFootball = league.sport === Sport.Football;
  const [openId, setOpenId] = useState<string>('next-step');
  const [nextStepError, setNextStepError] = useState<string | null>(null);
  const [waiverSuccess, setWaiverSuccess] = useState<string | null>(null);
  const [waiverError, setWaiverError] = useState<string | null>(null);
  const [dangerRevealed, setDangerRevealed] = useState(false);
  const leagueId = league.id ?? 0;

  useEffect(() => {
    if (!waiverSuccess) return;
    const id = setTimeout(() => setWaiverSuccess(null), 5000);
    return () => clearTimeout(id);
  }, [waiverSuccess]);

  useEffect(() => {
    if (!waiverError) return;
    const id = setTimeout(() => setWaiverError(null), 5000);
    return () => clearTimeout(id);
  }, [waiverError]);

  useEffect(() => {
    if (openId !== 'waivers') {
      setWaiverSuccess(null);
      setWaiverError(null);
    }
  }, [openId]);

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
            navigate(`/baseball/league/${newLeagueId}/commish`)
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
          currentWaiverType={league.waiverType === 'faab' ? 'faab' : 'standard'}
          currentFaabBudgetDefault={league.faabBudgetDefault ?? 100}
          isPremium={isPremium}
          onUpgrade={() => navigate('/profile/subscription')}
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
                rosterContinuity={league.rosterContinuity}
                eraFilter={league.eraFilter}
                baseballHofOnly={league.baseballHofOnly}
                customEraStartYear={league.customEraStartYear ?? undefined}
                customEraEndYear={league.customEraEndYear ?? undefined}
                isPremium={isPremium}
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
      // LS-9042: two different editor components, not platform duplication —
      // LeagueScoringEditor hardcodes GROUP_ORDER to the three baseball groups
      // (batting/pitching/fielding), while ScoringSettingsEditor is sport-aware
      // (passing/rushing/receiving/kicking + DST or IDP) via getGroupOrder().
      // LS-9105's premium-gated Position Bonuses section lives in
      // ScoringSettingsEditor since that's the component football leagues render.
      content: leagueId ? (
        isFootball ? (
          <ScoringSettingsEditor
            leagueId={leagueId}
            profile={scoringProfile}
            loading={scoringLoading}
            error={scoringError ?? null}
            onRefetch={async () => {
              await refetchScoring();
            }}
            draftStatus={league.draftStatus}
            sport="football"
            defensiveFormat={league.defensiveFormat}
            onUpgrade={() => navigate('/profile/subscription')}
          />
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
        <PremiumGate
          isPremium={league.waiverType !== 'faab' || isPremium}
          featureName="FAAB Waiver Processing"
          featureDescription="Manually triggering FAAB waiver claim processing requires a Premium subscription."
        >
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
        </PremiumGate>
      ) : null,
    },
    {
      id: 'audit-log',
      label: 'Audit Log',
      iconClass: 'gold',
      icon: <I.List size={16} />,
      content: leagueId ? <AuditLogPanel leagueId={leagueId} /> : null,
    },
    {
      id: 'danger',
      label: 'Danger Zone',
      iconClass: 'red',
      icon: <I.AlertTriangle size={16} />,
      testId: 'danger-zone-toggle',
      content: leagueId ? (
        dangerRevealed ? (
          <DeleteLeagueControl
            leagueId={leagueId}
            leagueName={league.name ?? 'this league'}
            teamCount={teams.length}
            seasonNumber={league.seasonNumber ?? undefined}
            isOwner={isLeagueOwner}
            isAdmin={isAdminUser}
            requireStepUp={requireStepUp}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 16,
              background: 'rgba(196, 30, 58, 0.06)',
              border: '1px solid rgba(196, 30, 58, 0.3)',
              borderRadius: 8,
            }}
          >
            <p
              style={{
                margin: 0,
                color: '#c41e3a',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <span role="img" aria-label="warning">
                ⚠️
              </span>{' '}
              Irreversible actions ahead. Proceed only if you intend to
              permanently delete this league.
            </p>
            <button
              type="button"
              data-testid="danger-zone-reveal"
              onClick={() => setDangerRevealed(true)}
              style={{
                alignSelf: 'flex-start',
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #c41e3a',
                borderRadius: 6,
                color: '#c41e3a',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Reveal danger options
            </button>
          </div>
        )
      ) : null,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isStepUpPrompting && (
        <StepUpModal onSuccess={onStepUpVerified} onDismiss={onStepUpDismiss} />
      )}
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
            onToggle={() => {
              const next = openId === s.id ? '' : s.id;
              if (s.id === 'danger' && next !== 'danger') {
                setDangerRevealed(false);
              }
              setOpenId(next);
            }}
          />
        ))}
      </div>
    </div>
  );
};

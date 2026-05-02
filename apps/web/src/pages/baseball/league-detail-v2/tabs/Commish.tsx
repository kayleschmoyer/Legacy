import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type LeagueFragment,
  type TeamFragment,
} from '../../../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../../../lib/scoring';
import { CommissionerAnnouncementsPanel } from '../../../../features/baseball/CommissionerAnnouncementsPanel';
import { DraftSettingsControl } from '../../../../components/commissioner/DraftSettingsControl';
import { NextStepControl } from '../../../../features/commissioner';
import { LeagueDuesControl } from '../../../../components/commissioner/LeagueDuesControl';
import { LeagueDuesStatusDashboard } from '../../../../components/commissioner/LeagueDuesStatusDashboard';
import { SeasonAwardsControl } from '../../../../components/commissioner/SeasonAwardsControl';
import { LeagueScoringEditor } from '../../../../features/baseball/LeagueScoringEditor';
import { DeleteLeagueControl } from '../../../../features/commissioner/DeleteLeagueControl';
import { I } from '../Icons';

interface AccordSection {
  id: string;
  label: string;
  iconClass?: 'gold' | 'red' | '';
  icon: React.ReactNode;
  content: React.ReactNode;
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
    >
      <div className="ls-accord-title">
        <div className={`icon-wrap ${section.iconClass ?? ''}`}>
          {section.icon}
        </div>
        <span className="label">{section.label}</span>
      </div>
      <I.ChevronDown className="ls-chev" size={16} />
    </button>
    {open ? <div className="ls-accord-body">{section.content}</div> : null}
  </div>
);

export interface CommishTabProps {
  league: LeagueFragment;
  teams: readonly TeamFragment[];
}

export const CommishTab: React.FC<CommishTabProps> = ({ league }) => {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string>('announcements');
  const leagueId = league.id ?? 0;

  const {
    profile: scoringProfile,
    loading: scoringLoading,
    error: scoringError,
    refetch: refetchScoring,
  } = useLeagueScoringSettings(leagueId);

  const sections: AccordSection[] = [
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
      id: 'draft-settings',
      label: 'Draft Settings',
      iconClass: 'gold',
      icon: <I.Settings size={16} />,
      content: leagueId ? (
        <DraftSettingsControl
          leagueId={leagueId}
          draftStatus={league.draftStatus}
          playerPool={league.playerPool}
          eraFilter={league.eraFilter}
          hofOnly={league.hofOnly}
          customEraStartYear={league.customEraStartYear ?? undefined}
          customEraEndYear={league.customEraEndYear ?? undefined}
        />
      ) : null,
    },
    {
      id: 'dues',
      label: 'League Dues',
      iconClass: 'gold',
      icon: <I.Dollar size={16} />,
      content: leagueId ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <LeagueDuesControl leagueId={leagueId} />
          <LeagueDuesStatusDashboard leagueId={leagueId} isCommissioner />
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
      ) : null,
    },
    {
      id: 'danger',
      label: 'Danger Zone',
      iconClass: 'red',
      icon: <I.AlertTriangle size={16} />,
      content: leagueId ? (
        <DeleteLeagueControl
          leagueId={leagueId}
          leagueName={league.name ?? 'this league'}
        />
      ) : null,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {leagueId ? (
        <NextStepControl
          leagueId={leagueId}
          currentMatchup={null}
          gamesPerMatchup={league.gamesPerMatchup ?? 1}
          draftStatus={league.draftStatus}
          leagueName={league.name ?? ''}
          frozenAt={league.frozenAt}
          totalMatchups={league.totalMatchups ?? undefined}
          onNavigateToDraftBoard={() =>
            navigate(`/baseball/league/${leagueId}/draft`)
          }
          onNavigateToLeague={(newLeagueId) =>
            navigate(`/baseball/league/${newLeagueId}`)
          }
        />
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

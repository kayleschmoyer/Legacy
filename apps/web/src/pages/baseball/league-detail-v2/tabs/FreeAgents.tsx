import React from 'react';
import { type LeagueFragment } from '../../../../api/db/graphql.generated';
import { LeagueFreeAgents } from '../../../../features/baseball/LeagueFreeAgents';
import { Banner, Section } from '../Shared';
import { I } from '../Icons';

export interface FreeAgentsTabProps {
  league: LeagueFragment;
  isMember: boolean;
  myTeamId: number | null;
}

export const FreeAgentsTab: React.FC<FreeAgentsTabProps> = ({
  league,
  isMember,
  myTeamId,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!isMember ? (
        <Banner
          kind="spectator"
          icon={<I.Eye size={20} />}
          title="Spectator Mode"
          sub="Browse the free-agent pool. Join the league to make claims."
        />
      ) : null}
      {league.waiverEnabled && isMember && !myTeamId ? (
        <Banner
          kind="info"
          icon={<I.Info size={20} />}
          title="Join a team to make waiver claims"
        />
      ) : null}
      <Section
        title="Free Agents"
        sub={
          league.waiverEnabled
            ? `${league.waiverType ?? 'Waivers'} active${
                league.faabBudgetDefault
                  ? ` · FAAB ${league.faabBudgetDefault}`
                  : ''
              }`
            : 'Available players in the league pool'
        }
      >
        {league.id != null ? (
          <LeagueFreeAgents
            leagueId={league.id}
            gamesPerMatchup={league.gamesPerMatchup ?? 5}
          />
        ) : null}
      </Section>
    </div>
  );
};

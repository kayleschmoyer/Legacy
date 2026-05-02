import React from 'react';
import { type LeagueFragment } from '../../../../api/db/graphql.generated';
import { TradingCenter } from '../../../../features/baseball/TradingCenter';
import { LeagueTradeBlock } from '../../../../features/baseball/LeagueTradeBlock';
import { Banner, Empty, Section } from '../Shared';
import { I } from '../Icons';

export interface TradesTabProps {
  league: LeagueFragment;
  isMember: boolean;
  myTeamId: number | null;
}

export const TradesTab: React.FC<TradesTabProps> = ({
  league,
  isMember,
  myTeamId,
}) => {
  if (!league.id) {
    return <Empty title="Trades unavailable" sub="League is missing an id." />;
  }
  if (!isMember || !myTeamId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner
          kind="spectator"
          icon={<I.Eye size={20} />}
          title="Spectator Mode"
          sub="Join the league to propose, accept, and review trades."
        />
        <Section title="Trade Block" sub="Players publicly listed as available">
          <LeagueTradeBlock leagueId={league.id} userTeamId={myTeamId} />
        </Section>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section
        title="Trading Center"
        sub="Pending offers, completed trades, and the trade block"
      >
        <TradingCenter
          leagueId={league.id}
          userTeamId={myTeamId}
          isCommissioner={false}
        />
      </Section>
      <Section title="Trade Block" sub="Players publicly listed as available">
        <LeagueTradeBlock leagueId={league.id} userTeamId={myTeamId} />
      </Section>
    </div>
  );
};

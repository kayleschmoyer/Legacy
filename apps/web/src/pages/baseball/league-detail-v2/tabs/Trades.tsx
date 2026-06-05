import React from 'react';
import { type LeagueFragment } from '../../../../api/db/graphql.generated';
import { TradingCenter } from '../../../../features/baseball/TradingCenter';
import { I } from '../Icons';
import { Banner, Empty, Section } from '../Shared';

export interface TradesTabProps {
  league: LeagueFragment;
  isMember: boolean;
  myTeamId: number | null;
  isCommissioner?: boolean;
}

export const TradesTab: React.FC<TradesTabProps> = ({
  league,
  isMember,
  myTeamId,
  isCommissioner = false,
}) => {
  const leagueId = league.id ?? 0;

  if (!league.id) {
    return <Empty title="Trades unavailable" sub="League is missing an id." />;
  }

  if (!isMember || myTeamId == null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Banner
          kind="spectator"
          icon={<I.Eye size={20} />}
          title="Spectator Mode"
          sub="Join the league to propose, accept, and review trades."
        />
        <Section
          title={<span data-testid="trade-center-heading">Trading Center</span>}
        >
          <Empty
            icon={<I.ArrowLeftRight size={32} />}
            title="Join this league to trade"
            sub="Only league members can view and submit trade offers. Ask the commissioner for an invite."
          />
        </Section>
      </div>
    );
  }

  return (
    <TradingCenter
      leagueId={leagueId}
      userTeamId={myTeamId}
      isCommissioner={isCommissioner}
    />
  );
};

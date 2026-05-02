import React from 'react';
import { type LeagueFragment } from '../../../../api/db/graphql.generated';
import { LeagueHistory } from '../../../../features/baseball/LeagueHistory';
import { Empty, Section } from '../Shared';
import { I } from '../Icons';

export interface HistoryTabProps {
  league: LeagueFragment;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ league }) => {
  if (!league.id) {
    return <Empty title="History unavailable" />;
  }
  return (
    <Section
      title="League History"
      sub="Records, past seasons, and championship runs"
      right={
        <span className="ls-chip ls-chip-final">
          <I.Trophy size={11} /> Archive
        </span>
      }
    >
      <LeagueHistory leagueId={league.id} />
    </Section>
  );
};

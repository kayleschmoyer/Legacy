import React, { useState } from 'react';
import {
  buildFreeAgentAriaLabel,
  type FreeAgentClaimPlayer,
  LeagueDetailFreeAgentsTab,
} from '@legacy-sports/shared-components/baseball';
import { type LeagueFragment } from '../../../../api/db/graphql.generated';
import { WaiverClaimModal } from '../../../../features/baseball/WaiverClaimModal';
import { I } from '../Icons';

export interface FreeAgentsTabProps {
  league: LeagueFragment;
  isMember: boolean;
  myTeamId: number | null;
}

/**
 * Web v2 Free Agents tab.
 *
 * Thin wrapper over the cross-platform `LeagueDetailFreeAgentsTab`
 * (`@legacy-sports/shared-components`, LS-7818) — web is canonical, the tab was
 * extracted to shared and is consumed by both web and native. Web supplies the
 * waiver-claim flow via `renderClaimAction`: a button that opens the
 * `WaiverClaimModal` (native supplies an inline FAAB cluster instead).
 */
export const FreeAgentsTab: React.FC<FreeAgentsTabProps> = ({
  league,
  isMember,
  myTeamId,
}) => {
  const [claimPlayer, setClaimPlayer] = useState<FreeAgentClaimPlayer | null>(
    null,
  );
  const leagueId = league.id ?? 0;

  return (
    <>
      <LeagueDetailFreeAgentsTab
        league={league}
        isMember={isMember}
        myTeamId={myTeamId}
        renderClaimAction={(player) => (
          <button
            type="button"
            className="ls-btn ls-btn-gold sm"
            data-testid="claim-free-agent-button"
            onClick={() => setClaimPlayer(player)}
            aria-label={buildFreeAgentAriaLabel(
              player.firstName,
              player.lastName,
            )}
          >
            <I.Plus size={11} />
            Claim
          </button>
        )}
      />

      {claimPlayer ? (
        <WaiverClaimModal
          open
          onClose={() => setClaimPlayer(null)}
          player={claimPlayer}
          leagueId={leagueId}
        />
      ) : null}
    </>
  );
};

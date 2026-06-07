/**
 * Tests for the web v2 FreeAgentsTab wrapper (LS-7818).
 *
 * The list/filters/columns/banners now live in the shared
 * `LeagueDetailFreeAgentsTab` (covered by its own spec). Here we only assert
 * the web wrapper's contract: it forwards league/membership props, renders the
 * web Claim button (opening the WaiverClaimModal) via `renderClaimAction`, and
 * builds the claim button's aria-label.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import type { FreeAgentClaimPlayer } from '@legacy-sports/shared-components/baseball';
import { FreeAgentsTab } from './FreeAgents';

// Capture the props the wrapper passes to the shared tab so we can drive
// renderClaimAction with a representative player.
let lastSharedProps: any;

jest.mock('@legacy-sports/shared-components/baseball', () => ({
  buildFreeAgentAriaLabel: (first?: string | null, last?: string | null) =>
    `Add ${[first, last].filter(Boolean).join(' ')}`.trim(),
  LeagueDetailFreeAgentsTab: (props: any) => {
    lastSharedProps = props;
    const player: FreeAgentClaimPlayer = {
      id: 77,
      firstName: 'Walter',
      lastName: 'Johnson',
      eligiblePositions: ['SP'],
    };
    return (
      <div data-testid="shared-free-agents-tab">
        {props.renderClaimAction ? props.renderClaimAction(player) : null}
      </div>
    );
  },
}));

jest.mock('../../../../features/baseball/WaiverClaimModal', () => ({
  WaiverClaimModal: ({ player }: { player: { id: number } }) => (
    <div data-testid="waiver-claim-modal">claim {player.id}</div>
  ),
}));

jest.mock('../Icons', () => ({
  I: { Plus: () => <span /> },
}));

const league = {
  id: 1,
  name: 'Test League',
  sport: 'baseball',
  waiverEnabled: false,
} as any;

beforeEach(() => {
  lastSharedProps = undefined;
});

describe('FreeAgentsTab (web wrapper)', () => {
  it('forwards league and membership props to the shared tab', () => {
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    expect(screen.getByTestId('shared-free-agents-tab')).toBeInTheDocument();
    expect(lastSharedProps.league).toBe(league);
    expect(lastSharedProps.isMember).toBe(true);
    expect(lastSharedProps.myTeamId).toBe(42);
  });

  it('renders the web Claim button via renderClaimAction with an aria-label', () => {
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    const claim = screen.getByTestId('claim-free-agent-button');
    expect(claim).toBeInTheDocument();
    expect(claim).toHaveAttribute('aria-label', 'Add Walter Johnson');
  });

  it('opens the waiver claim modal when the Claim button is clicked', () => {
    render(<FreeAgentsTab league={league} isMember myTeamId={42} />);
    expect(screen.queryByTestId('waiver-claim-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('claim-free-agent-button'));
    expect(screen.getByTestId('waiver-claim-modal')).toHaveTextContent(
      'claim 77',
    );
  });
});

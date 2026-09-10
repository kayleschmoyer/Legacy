import React from 'react';
import { DraftPacketSection } from './DraftPacketSection';
import type { DraftPickRecord } from './types';
import { fireEvent, render, screen } from '../../test-utils';

const PICKS: DraftPickRecord[] = [
  {
    id: '1',
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-01-01T00:00:00Z',
    teamId: 1,
    playerId: 1,
    player: { id: 1, firstName: 'Mike', lastName: 'Trout' },
  },
];

const teamNameById = () => 'Dinger Dynasty';

describe('DraftPacketSection', () => {
  it('shows the locked upsell card for a non-premium viewer', () => {
    render(
      <DraftPacketSection
        pickHistory={PICKS}
        teamNameById={teamNameById}
        leagueName="Test League"
        isPremium={false}
        onDownload={jest.fn()}
      />,
    );

    expect(screen.getByText('Draft Packet')).toBeTruthy();
    expect(screen.queryByTestId('draft-packet-download')).toBeNull();
  });

  it('renders the full packet controls for a premium viewer', () => {
    render(
      <DraftPacketSection
        pickHistory={PICKS}
        teamNameById={teamNameById}
        leagueName="Test League"
        isPremium
        onDownload={jest.fn()}
      />,
    );

    expect(screen.getByTestId('draft-packet-toggle')).toBeTruthy();
    expect(screen.getByTestId('draft-packet-download')).toBeTruthy();
    expect(screen.queryByText('Mike Trout')).toBeNull();
  });

  it('expands to show every pick when "View Full Draft" is pressed', () => {
    render(
      <DraftPacketSection
        pickHistory={PICKS}
        teamNameById={teamNameById}
        leagueName="Test League"
        isPremium
        onDownload={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('draft-packet-toggle'));
    expect(screen.getByText('Mike Trout')).toBeTruthy();
  });

  it('calls onDownload with the built CSV and a sanitized filename', () => {
    const onDownload = jest.fn<void, [string, string]>();
    render(
      <DraftPacketSection
        pickHistory={PICKS}
        teamNameById={teamNameById}
        leagueName="Test League"
        isPremium
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByTestId('draft-packet-download'));

    expect(onDownload).toHaveBeenCalledTimes(1);
    const [contents, filename] = onDownload.mock.calls[0];
    expect(filename).toBe('Test-League-draft-packet.csv');
    expect(contents).toContain('Mike Trout');
  });
});

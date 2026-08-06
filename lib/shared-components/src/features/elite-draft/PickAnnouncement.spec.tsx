/**
 * LS-9060: PickAnnouncement moved from raw div/className/styles.ts CSS to
 * Tamagui primitives. Pins the overlay's testID/a11y contract (Playwright's
 * `apps/web-e2e/src/integration/helpers/draft-board-overlay.ts` dismisses it
 * via `getByTestId('draft-announce-overlay')`) and the label/dismiss
 * behavior that EliteDraftBoardScreen.tsx relies on.
 */
import React from 'react';
import { PickAnnouncement } from './PickAnnouncement';
import type { DraftPlayer } from './types';
import { render } from '../../test-utils';

const player: DraftPlayer = {
  id: 1,
  name: 'Mike Trout',
  position: 'OF',
  avg: 0.3,
  hr: 40,
  rbi: 100,
  runs: 90,
  sb: 10,
  games: 150,
  hits: 180,
  obp: 0.4,
  slg: 0.55,
};

function renderAnnouncement(
  overrides: Partial<React.ComponentProps<typeof PickAnnouncement>> = {},
) {
  return render(
    <PickAnnouncement
      player={player}
      pickNumber={5}
      round={1}
      roundPickNumber={5}
      isMyPick={false}
      isAuto={false}
      leaving={false}
      onDismiss={jest.fn()}
      {...overrides}
    />,
  );
}

describe('PickAnnouncement', () => {
  it('exposes the overlay testID/role the E2E dismiss helper relies on', () => {
    const { getByTestId } = renderAnnouncement();
    const overlay = getByTestId('draft-announce-overlay');

    expect(overlay.getAttribute('role')).toBe('alert');
    expect(overlay.getAttribute('aria-live')).toBe('assertive');
  });

  it('calls onDismiss when the overlay is clicked', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = renderAnnouncement({ onDismiss });

    getByTestId('draft-announce-overlay').click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders the YOUR PICK label for the viewer's own pick", () => {
    const { getByText } = renderAnnouncement({ isMyPick: true });
    expect(getByText('🎉 YOUR PICK')).toBeTruthy();
  });

  it("renders the OPPONENT PICK label for another team's pick", () => {
    const { getByText } = renderAnnouncement({
      isMyPick: false,
      isAuto: false,
    });
    expect(getByText('📋 OPPONENT PICK')).toBeTruthy();
  });

  it('renders the AUTO-DRAFTED label plus reason when auto-picked', () => {
    const { getByText } = renderAnnouncement({
      isAuto: true,
      autoPickReason: 'Pick clock expired',
    });
    expect(getByText('⏱ AUTO-DRAFTED')).toBeTruthy();
    expect(getByText('Pick clock expired')).toBeTruthy();
  });

  it('renders commentary when provided', () => {
    const { getByText } = renderAnnouncement({
      commentary: 'A steal at pick 5!',
    });
    expect(getByText('A steal at pick 5!')).toBeTruthy();
  });
});

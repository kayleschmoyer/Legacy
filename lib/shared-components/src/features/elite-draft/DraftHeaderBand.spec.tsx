import React from 'react';
import { DraftHeaderBand } from './DraftHeaderBand';
import { render, screen } from '../../test-utils';

const baseProps = {
  isMyPick: false,
  draftPaused: false,
  untimed: false,
  round: 1,
  roundPickNumber: 2,
  timeRemaining: 45,
  pickTimeLimitSeconds: 90,
  onClockTeamName: 'Bronx Bombers',
  topQueuedPlayerName: null,
};

describe('DraftHeaderBand', () => {
  it('renders the default state eyebrow, clock, and on-clock team', () => {
    render(<DraftHeaderBand {...baseProps} />);

    expect(screen.getByText('On the clock')).toBeTruthy();
    expect(screen.getByText('0:45')).toBeTruthy();
    expect(screen.getByText('Bronx Bombers')).toBeTruthy();
    expect(screen.getByText('RD 1 · PICK 2')).toBeTruthy();
  });

  it('switches to the second-person eyebrow on my pick', () => {
    render(<DraftHeaderBand {...baseProps} isMyPick />);

    expect(screen.getByText("YOU'RE ON THE CLOCK!")).toBeTruthy();
  });

  it('shows the draft-paused eyebrow regardless of whose pick it is', () => {
    render(<DraftHeaderBand {...baseProps} draftPaused isMyPick />);

    expect(screen.getByText('Draft paused')).toBeTruthy();
  });

  it('hides the clock entirely for untimed mock drafts', () => {
    render(<DraftHeaderBand {...baseProps} untimed timeRemaining={45} />);

    expect(screen.queryByText('0:45')).toBeNull();
  });

  it('shows the auto-pick hint with the top queued player only on my pick', () => {
    render(
      <DraftHeaderBand
        {...baseProps}
        isMyPick
        topQueuedPlayerName="Bobby Witt Jr."
      />,
    );

    expect(screen.getByTestId('draft-header-band-autopick-hint')).toBeTruthy();
    expect(
      screen.getByText(
        'Auto pick would be Bobby Witt Jr. · queue drafts first',
      ),
    ).toBeTruthy();
  });

  it('hides the auto-pick hint when there is no queued player', () => {
    render(
      <DraftHeaderBand {...baseProps} isMyPick topQueuedPlayerName={null} />,
    );

    expect(screen.queryByTestId('draft-header-band-autopick-hint')).toBeNull();
  });

  it('hides the auto-pick hint on someone else’s pick even with a queued player', () => {
    render(
      <DraftHeaderBand
        {...baseProps}
        isMyPick={false}
        topQueuedPlayerName="Bobby Witt Jr."
      />,
    );

    expect(screen.queryByTestId('draft-header-band-autopick-hint')).toBeNull();
  });
});

describe('DraftHeaderBand connection staleness (LS-9856)', () => {
  it('swaps the eyebrow and dims the clock while disconnected', () => {
    render(<DraftHeaderBand {...baseProps} connectionStale />);

    expect(
      screen.getByText('Reconnecting — clock may be out of date'),
    ).toBeTruthy();
    expect(screen.queryByText('On the clock')).toBeNull();
    // The clock still renders — the user needs to see what it last said —
    // but it must no longer read as live.
    expect(screen.getByText('0:45')).toBeTruthy();
  });

  it('leaves the live eyebrow alone when connected', () => {
    render(<DraftHeaderBand {...baseProps} connectionStale={false} />);

    expect(screen.getByText('On the clock')).toBeTruthy();
  });
});

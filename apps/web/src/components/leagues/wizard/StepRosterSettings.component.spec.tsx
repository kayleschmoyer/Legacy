import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DST_ROSTER_DEFAULTS, StepRosterSettings } from './StepRosterSettings';

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  Text: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  XStack: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  YStack: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// RosterPositionsEditor's own behavior (slot rows, premium locking, live
// totals) is unit-tested in lib/shared-components — this file only tests
// what StepRosterSettings itself is responsible for: wiring isPremium/
// onUpgrade through, and the web-specific roster-floor guard (LS-6149).
jest.mock('@legacy-sports/shared-components/leagues', () => ({
  RosterPositionsEditor: ({
    rosterSlots,
    onChange,
    isPremium,
    onUpgrade,
  }: {
    rosterSlots: Record<string, number>;
    onChange: (slots: Record<string, number>) => void;
    isPremium: boolean;
    onUpgrade: () => void;
  }) => (
    <div>
      <span>
        Total: {Object.values(rosterSlots).reduce((s, n) => s + n, 0)}
      </span>
      <span>isPremium: {String(isPremium)}</span>
      <button
        type="button"
        onClick={() =>
          onChange({ ...rosterSlots, QB: (rosterSlots.QB ?? 0) + 1 })
        }
      >
        Increment QB
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({ ...rosterSlots, QB: (rosterSlots.QB ?? 0) - 1 })
        }
      >
        Decrement QB
      </button>
      <button type="button" onClick={onUpgrade}>
        Upgrade SFLEX
      </button>
    </div>
  ),
}));

function Controlled({
  initial,
  isPremium = false,
  onUpgrade = () => undefined,
}: {
  initial: Record<string, number>;
  isPremium?: boolean;
  onUpgrade?: () => void;
}) {
  const [rosterSlots, setRosterSlots] = React.useState(initial);
  return (
    <StepRosterSettings
      defensiveFormat="dst"
      rosterSlots={rosterSlots}
      onChange={setRosterSlots}
      isPremium={isPremium}
      onUpgrade={onUpgrade}
    />
  );
}

describe('StepRosterSettings', () => {
  it('renders the default roster total', () => {
    render(<Controlled initial={{ ...DST_ROSTER_DEFAULTS }} />);
    const defaultTotal = Object.values(DST_ROSTER_DEFAULTS).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(screen.getByText(`Total: ${defaultTotal}`)).toBeInTheDocument();
  });

  it('never lets the roster total drop below the server minimum of 10 via decrement (LS-6149)', () => {
    // Start at exactly the floor so any further decrement would push the
    // total to 9 — the server rejects anything below 10.
    render(
      <Controlled
        initial={{ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 1 }}
      />,
    );

    expect(screen.getByText('Total: 10')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Decrement QB'));

    // Must be a no-op — total remains 10.
    expect(screen.getByText('Total: 10')).toBeInTheDocument();
  });

  it('allows decrementing a slot when the total is above the floor', () => {
    render(<Controlled initial={{ ...DST_ROSTER_DEFAULTS }} />);
    const defaultTotal = Object.values(DST_ROSTER_DEFAULTS).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(screen.getByText(`Total: ${defaultTotal}`)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Decrement QB'));

    expect(screen.getByText(`Total: ${defaultTotal - 1}`)).toBeInTheDocument();
  });

  it('passes isPremium through to RosterPositionsEditor (LS-6151)', () => {
    render(
      <Controlled initial={{ ...DST_ROSTER_DEFAULTS }} isPremium={true} />,
    );
    expect(screen.getByText('isPremium: true')).toBeInTheDocument();
  });

  it('forwards onUpgrade for a non-premium viewer interacting with a gated slot (LS-6151)', () => {
    const onUpgrade = jest.fn();
    render(
      <Controlled
        initial={{ ...DST_ROSTER_DEFAULTS }}
        isPremium={false}
        onUpgrade={onUpgrade}
      />,
    );

    fireEvent.click(screen.getByText('Upgrade SFLEX'));

    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});

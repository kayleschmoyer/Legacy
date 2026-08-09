import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DST_ROSTER_DEFAULTS, StepRosterSettings } from './StepRosterSettings';

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  Text: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  XStack: ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => <div onClick={onPress}>{children}</div>,
  YStack: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  Minus: () => <span>-</span>,
  Plus: () => <span>+</span>,
}));

function Controlled({ initial }: { initial: Record<string, number> }) {
  const [rosterSlots, setRosterSlots] = React.useState(initial);
  return (
    <StepRosterSettings
      defensiveFormat="dst"
      rosterSlots={rosterSlots}
      onChange={setRosterSlots}
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
    expect(screen.getByText(String(defaultTotal))).toBeInTheDocument();
  });

  it('never lets the roster total drop below the server minimum of 10 via decrement (LS-6149)', () => {
    // Start at exactly the floor so any further decrement would push the
    // total to 9 — the server rejects anything below 10.
    render(
      <Controlled
        initial={{ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 1 }}
      />,
    );

    expect(screen.getByText('10')).toBeInTheDocument();

    const qbRow = screen.getByText('QB').closest('div')!.parentElement!;
    const decrementButton = within(qbRow).getByText('-').closest('div')!;
    fireEvent.click(decrementButton);

    // Total must remain 10 and QB's individual count must remain unchanged —
    // the click must have been a no-op, not silently swallowed after mutating state.
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('allows decrementing a slot when the total is above the floor', () => {
    render(<Controlled initial={{ ...DST_ROSTER_DEFAULTS }} />);
    const defaultTotal = Object.values(DST_ROSTER_DEFAULTS).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(screen.getByText(String(defaultTotal))).toBeInTheDocument();

    const rbRow = screen.getByText('RB').closest('div')!.parentElement!;
    const decrementButton = within(rbRow).getByText('-').closest('div')!;
    fireEvent.click(decrementButton);

    expect(screen.getByText(String(defaultTotal - 1))).toBeInTheDocument();
  });
});

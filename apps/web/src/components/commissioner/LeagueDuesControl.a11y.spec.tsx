/**
 * Regression guard for LS-10797: the Enable League Dues and Auto-Reminders
 * toggles were pointer-only XStacks — no role, no tab stop, no checked state,
 * no Enter/Space handling — so keyboard users tabbed straight past them.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LeagueDuesControl } from './LeagueDuesControl';

const mockUseSettings = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDuesSettingsQuery: (...args: unknown[]): unknown =>
    mockUseSettings(...args),
  useUpdateDuesSettingsMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

// The real `tamagui` package needs a TamaguiProvider this suite doesn't set
// up (see EliteDraftBoard.a11y.spec.tsx). Render primitives as plain DOM,
// forwarding only the accessibility/event props under test and mapping
// `onPress` → `onClick`, so real keyboard and click events drive the toggles.
jest.mock('tamagui', () => {
  const ReactActual: typeof React = jest.requireActual('react');
  const FORWARDED = new Set(['role', 'tabIndex', 'onKeyDown']);
  const Passthrough = ({
    children,
    onPress,
    ...props
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
  } & Record<string, unknown>) => {
    const domProps: Record<string, unknown> = { onClick: onPress };
    for (const [key, value] of Object.entries(props)) {
      if (FORWARDED.has(key) || key.startsWith('aria-')) domProps[key] = value;
    }
    return ReactActual.createElement('div', domProps, children);
  };
  return {
    createTokens: (tokens: unknown) => tokens,
    Button: Passthrough,
    Card: Passthrough,
    H4: Passthrough,
    Input: () => <input readOnly />,
    Separator: () => <hr />,
    Spinner: () => <span />,
    Text: Passthrough,
    XStack: Passthrough,
    YStack: Passthrough,
  };
});

const duesSwitch = () =>
  screen.getByRole('switch', { name: 'Enable League Dues' });
const reminderSwitch = () =>
  screen.getByRole('switch', { name: 'Auto-Reminders' });

describe('LeagueDuesControl toggles — keyboard + screen reader (LS-10797)', () => {
  beforeEach(() => {
    mockUseSettings.mockReset();
    mockUseSettings.mockReturnValue({
      data: {
        leagueDuesSettings: {
          id: 1,
          leagueId: 1,
          enabled: false,
          amountCents: 0,
          reminderEnabled: false,
          reminderDayOfWeek: 1,
        },
      },
      loading: false,
    });
  });

  it('exposes Enable League Dues as a tab-reachable switch with its checked state', async () => {
    render(<LeagueDuesControl leagueId={1} />);

    expect(duesSwitch().getAttribute('aria-checked')).toBe('false');

    await userEvent.tab();
    expect(document.activeElement).toBe(duesSwitch());
  });

  it('toggles Enable League Dues with Enter and Space', () => {
    render(<LeagueDuesControl leagueId={1} />);

    fireEvent.keyDown(duesSwitch(), { key: 'Enter' });
    expect(duesSwitch().getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(duesSwitch(), { key: ' ' });
    expect(duesSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('makes Auto-Reminders tab-reachable and keyboard-operable once dues are enabled', async () => {
    render(<LeagueDuesControl leagueId={1} />);
    fireEvent.keyDown(duesSwitch(), { key: 'Enter' });

    expect(reminderSwitch().getAttribute('aria-checked')).toBe('false');
    expect(reminderSwitch().getAttribute('tabindex')).toBe('0');

    // Dues switch → Dues Amount input → Auto-Reminders switch.
    duesSwitch().focus();
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(reminderSwitch());

    fireEvent.keyDown(reminderSwitch(), { key: ' ' });
    expect(reminderSwitch().getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(reminderSwitch(), { key: 'Enter' });
    expect(reminderSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('ignores unrelated keys', () => {
    render(<LeagueDuesControl leagueId={1} />);

    fireEvent.keyDown(duesSwitch(), { key: 'a' });
    expect(duesSwitch().getAttribute('aria-checked')).toBe('false');
  });
});

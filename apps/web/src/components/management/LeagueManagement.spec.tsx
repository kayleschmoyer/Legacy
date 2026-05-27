import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LeagueManagement } from './LeagueManagement';

// ── Tamagui passthrough mock — strip non-HTML props to avoid DOM warnings ─────
type AnyProps = { children?: React.ReactNode; [key: string]: unknown };

const passthrough =
  (Tag: keyof JSX.IntrinsicElements) =>
  ({ children, id, role, className }: AnyProps) => {
    const safeProps: Record<string, unknown> = {};
    if (id !== undefined) safeProps.id = id;
    if (role !== undefined) safeProps.role = role;
    if (className !== undefined) safeProps.className = className;
    return React.createElement(Tag, safeProps, children);
  };

jest.mock('tamagui', () => ({
  Button: ({ children, onPress, disabled }: AnyProps) => (
    <button
      onClick={onPress as React.MouseEventHandler}
      disabled={(disabled as boolean) ?? false}
      type="button"
    >
      {children}
    </button>
  ),
  Card: passthrough('div'),
  Dialog: Object.assign(
    ({ children, open }: AnyProps) => (open ? children : null),
    {
      Portal: ({ children }: AnyProps) => children,
      Overlay: () => null,
      Content: ({ children, role }: AnyProps) => (
        <div role={role as string}>{children}</div>
      ),
      Title: ({ children, id }: AnyProps) => (
        <h2 id={id as string}>{children}</h2>
      ),
      Description: ({ children, id }: AnyProps) => (
        <p id={id as string}>{children}</p>
      ),
      Close: ({ children }: AnyProps) => children,
    },
  ),
  H3: ({ children }: AnyProps) => <h3>{children}</h3>,
  H4: ({ children }: AnyProps) => <h4>{children}</h4>,
  Separator: () => <hr />,
  Spinner: () => <span aria-label="loading" />,
  Text: ({ children }: AnyProps) => <span>{children}</span>,
  XStack: passthrough('div'),
  YStack: passthrough('div'),
}));

// ── Colors mock ───────────────────────────────────────────────────────────────
jest.mock('../../constants/colors', () => ({
  BRAND_GOLD_LIGHT: '#C5A55A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  withAlpha: (color: string, _alpha: number) => color,
}));

// ── LOGGER mock ───────────────────────────────────────────────────────────────
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── GraphQL mutation mock ─────────────────────────────────────────────────────
const mockMutation = jest.fn();
jest.mock('../../api/db/graphql.generated', () => ({
  useDeleteAllLeaguesMutation: () => [
    mockMutation,
    { loading: false, error: undefined },
  ],
}));

// Suppress window.alert in tests
window.alert = jest.fn();

// Returns a promise that never settles — simulates a hanging network request
const neverResolves = <T = never,>(): Promise<T> =>
  new Promise<T>(() => undefined);

// Flush microtasks inside act() so timer rejections trigger state updates
const flushMicrotasks = () => Promise.resolve();

describe('LeagueManagement', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (window.alert as jest.Mock).mockClear();
    mockMutation.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows timeout error after 30s when the mutation hangs', async () => {
    mockMutation.mockImplementation(() => neverResolves());

    render(<LeagueManagement />);

    // Open first confirmation dialog
    fireEvent.click(
      screen.getByRole('button', { name: /Delete All Leagues/i }),
    );
    // Advance to final confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    // Trigger the mutation
    fireEvent.click(
      screen.getByRole('button', { name: /Yes, Delete Everything/i }),
    );

    // Advance past the 30s timeout
    await act(async () => {
      jest.advanceTimersByTime(30_001);
      await flushMicrotasks();
    });

    // The error card renders "Error: <message>" as visible text
    expect(
      screen.getAllByText(/Deletion timed out — please try again\./i).length,
    ).toBeGreaterThan(0);
  });

  it('clears the error when the user reopens the dialog', async () => {
    mockMutation.mockImplementation(() => neverResolves());

    render(<LeagueManagement />);

    fireEvent.click(
      screen.getByRole('button', { name: /Delete All Leagues/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Yes, Delete Everything/i }),
    );

    await act(async () => {
      jest.advanceTimersByTime(30_001);
      await flushMicrotasks();
    });

    expect(
      screen.getAllByText(/Deletion timed out — please try again\./i).length,
    ).toBeGreaterThan(0);

    // Re-opening the flow clears the error
    fireEvent.click(
      screen.getByRole('button', { name: /Delete All Leagues/i }),
    );
    expect(
      screen.queryAllByText(/Deletion timed out — please try again\./i),
    ).toHaveLength(0);
  });

  it('calls the mutation and shows success on completion', async () => {
    mockMutation.mockResolvedValue({
      data: { deleteAllLeagues: 'Deleted 3 leagues' },
    });

    render(<LeagueManagement />);

    fireEvent.click(
      screen.getByRole('button', { name: /Delete All Leagues/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Yes, Delete Everything/i }),
      );
      await flushMicrotasks();
    });

    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Deleted 3 leagues'),
    );
  });
});

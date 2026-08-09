/**
 * LS-9146 — export a league's settings as a JSON file so they can be
 * re-imported on the create-league page.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import { ExportLeagueSettingsControl } from './ExportLeagueSettingsControl';

const mockUseGetLeagueTeamsQuery = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueTeamsQuery: (...args: unknown[]): unknown =>
    mockUseGetLeagueTeamsQuery(...args),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

jest.mock('@tamagui/lucide-icons', () => {
  const Icon = () => <span />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('tamagui', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Button: ({
      children,
      onPress,
      ...rest
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
    }) => (
      <button type="button" onClick={onPress} {...rest}>
        {children}
      </button>
    ),
    Card: Passthrough,
    Text: Passthrough,
    XStack: Passthrough,
    YStack: Passthrough,
  };
});

function baseProps() {
  return {
    leagueId: 1,
    sport: 'baseball' as const,
    leagueName: 'The Sluggers',
    waiverType: 'faab',
    faabBudgetDefault: 100,
    isPublic: false,
  };
}

describe('ExportLeagueSettingsControl', () => {
  const createObjectURL = jest.fn<string, [Blob]>();
  const revokeObjectURL = jest.fn<void, [string]>();

  beforeEach(() => {
    jest.useFakeTimers();
    mockUseGetLeagueTeamsQuery.mockReset();
    mockLoggerError.mockReset();
    mockUseGetLeagueTeamsQuery.mockReturnValue({
      data: { leagueTeams: [{ id: 1 }, { id: 2 }] },
    });

    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    createObjectURL.mockImplementation(() => 'blob:mock-1');
    (
      URL as unknown as { createObjectURL: typeof createObjectURL }
    ).createObjectURL = createObjectURL;
    (
      URL as unknown as { revokeObjectURL: typeof revokeObjectURL }
    ).revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the export button', () => {
    render(<ExportLeagueSettingsControl {...baseProps()} />);
    expect(
      screen.getByTestId('export-league-settings-button'),
    ).toBeInTheDocument();
  });

  it('downloads a settings file and shows a transient confirmation on click', () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<ExportLeagueSettingsControl {...baseProps()} />);
    expect(screen.queryByText('Downloaded!')).not.toBeInTheDocument();

    act(() => {
      screen.getByTestId('export-league-settings-button').click();
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Downloaded!')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Downloaded!')).not.toBeInTheDocument();

    clickSpy.mockRestore();
  });

  it('logs and swallows an error instead of crashing when the download fails', () => {
    createObjectURL.mockImplementation(() => {
      throw new Error('blob failed');
    });

    render(<ExportLeagueSettingsControl {...baseProps()} />);
    act(() => {
      screen.getByTestId('export-league-settings-button').click();
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Failed to export league settings',
      expect.any(Error),
    );
    expect(screen.queryByText('Downloaded!')).not.toBeInTheDocument();
  });

  it('clears the pending reset timeout on unmount instead of leaking it', () => {
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    const { unmount } = render(
      <ExportLeagueSettingsControl {...baseProps()} />,
    );
    act(() => {
      screen.getByTestId('export-league-settings-button').click();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('waits for the teams query before including numberOfTeams in the export', async () => {
    render(<ExportLeagueSettingsControl {...baseProps()} />);
    await waitFor(() =>
      expect(mockUseGetLeagueTeamsQuery).toHaveBeenCalledWith({
        variables: { leagueId: 1 },
      }),
    );
  });
});

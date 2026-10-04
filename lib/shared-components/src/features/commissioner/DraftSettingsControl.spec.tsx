/**
 * Component tests for DraftSettingsControl load states (LS-10467) — the
 * spinner must only block before the first result, a failed load must surface
 * an explicit error + retry instead of rendering the form with default
 * settings (so Save is never offered over an unloaded draft).
 */
import React from 'react';
import { DraftSettingsControl } from './DraftSettingsControl';
import { fireEvent, render, screen } from '../../test-utils';

const mockUpdateDraftSettings = jest.fn();
const mockRefetch = jest.fn(() => Promise.resolve());
let mockDraftResult: {
  data?: { getLeagueDraft: Record<string, unknown> | null };
  loading: boolean;
  error?: Error;
};

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDraftQuery: () => ({ ...mockDraftResult, refetch: mockRefetch }),
  useUpdateDraftSettingsMutation: () => [
    mockUpdateDraftSettings,
    { loading: false },
  ],
}));

type Children = { children?: React.ReactNode };
type ButtonProps = Children & { onPress?: () => void; disabled?: boolean };

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Button = ({ children, onPress, disabled }: ButtonProps) => (
    <button type="button" onClick={onPress} disabled={!!disabled}>
      {children}
    </button>
  );
  return {
    Button,
    Card: PassThrough,
    H4: PassThrough,
    Input: () => <input />,
    Spinner: () => <span>spinner</span>,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

jest.mock('@tamagui/lucide-icons/icons/Check', () => ({ Check: () => null }));
jest.mock('@tamagui/lucide-icons/icons/Lock', () => ({ Lock: () => null }));
jest.mock('@tamagui/lucide-icons/icons/Settings', () => ({
  Settings: () => null,
}));

jest.mock('../../components/DateTimePicker', () => ({
  DateTimePicker: () => null,
}));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: Children) => <div>{children}</div>,
}));

const defaultProps = {
  leagueId: 1,
  draftStatus: 'not-started',
  playerPool: 'all',
};

const loadedDraft = {
  getLeagueDraft: {
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'linear',
    pickTimeLimitSeconds: 120,
    scheduledAt: null,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftResult = { data: undefined, loading: false };
});

describe('DraftSettingsControl load states (LS-10467)', () => {
  it('shows the spinner only while there is no data yet', () => {
    mockDraftResult = { data: undefined, loading: true };
    render(<DraftSettingsControl {...defaultProps} />);

    expect(screen.getByText('Loading draft settings...')).toBeTruthy();
    expect(screen.queryByText('Save Draft Settings')).toBeNull();
  });

  it('renders cached settings while a background refresh is in flight', () => {
    mockDraftResult = { data: loadedDraft, loading: true };
    render(<DraftSettingsControl {...defaultProps} />);

    expect(screen.queryByText('Loading draft settings...')).toBeNull();
    expect(screen.getByText('Save Draft Settings')).toBeTruthy();
  });

  it('shows an error with retry instead of default settings when the load fails', () => {
    mockDraftResult = {
      data: undefined,
      loading: false,
      error: new Error('Network request failed'),
    };
    render(<DraftSettingsControl {...defaultProps} />);

    expect(
      screen.getByText("Couldn't load draft settings: Network request failed"),
    ).toBeTruthy();
    // The form (and its Save button) must not render with defaults.
    expect(screen.queryByText('Save Draft Settings')).toBeNull();
    expect(screen.queryByText('Loading draft settings...')).toBeNull();

    fireEvent.click(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockUpdateDraftSettings).not.toHaveBeenCalled();
  });

  it('renders the form when the league has no draft record yet', () => {
    mockDraftResult = { data: { getLeagueDraft: null }, loading: false };
    render(<DraftSettingsControl {...defaultProps} />);

    expect(screen.queryByText(/Couldn't load draft settings/)).toBeNull();
    expect(screen.getByText('Save Draft Settings')).toBeTruthy();
  });
});

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { View as RNView } from 'react-native';

import CreateLeagueScreen, { buildCreateLeagueInput } from './create';

// ── Mock type helpers ────────────────────────────────────────────────────────

type WizardProps = {
  sport: 'baseball' | 'football';
  initialLeagueName?: string;
  isPremium: boolean;
  premiumLoading: boolean;
  submitting?: boolean;
  submitError?: string;
  onSubmit: (form: WizardForm) => void;
  onClose: (isDirty: boolean) => void;
  onUpgrade: (featureName: string) => void;
};

type WizardForm = ReturnType<typeof makeForm>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockNavigate = jest.fn();
let mockSearchParams: { name?: string; sport?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  useLocalSearchParams: () => mockSearchParams,
}));

let mockIsPremium = false;
let mockPremiumLoading = false;
jest.mock('../../../features/subscription', () => ({
  useSubscription: () => ({
    isPremium: mockIsPremium,
    loading: mockPremiumLoading,
  }),
}));

// The wizard itself is covered by its own spec in lib/shared-components; here
// it is a prop probe so this spec stays about the data wiring this route owns.
let wizardProps: WizardProps | undefined;
jest.mock('@legacy-sports/shared-components/leagues', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<{ View: typeof RNView }>('react-native');
  const constants = jest.requireActual<
    typeof import('../../../../../../lib/shared-components/src/features/leagues/create-wizard/constants')
  >(
    '../../../../../../lib/shared-components/src/features/leagues/create-wizard/constants',
  );
  return {
    ...constants,
    LeagueCreateWizard: (props: WizardProps) => {
      wizardProps = props;
      return ReactActual.createElement(View, {
        testID: 'league-create-wizard',
      });
    },
  };
});

jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// react-native's index re-exports `require('./Libraries/Alert/Alert').default`,
// so the mock must live on `default` for `import { Alert }` to resolve to it.
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
}));

const mockCreateLeagueMutate = jest.fn();
const mockCreateLeagueState: { loading: boolean; error?: { message: string } } =
  { loading: false, error: undefined };
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Football: 'football', Baseball: 'baseball' },
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  useCreateLeagueMutation: (options?: {
    onCompleted?: (data: unknown) => void;
    onError?: (error: unknown) => void;
  }) => {
    mockCreateLeagueMutate.mockImplementation((_args: unknown) => {
      options?.onCompleted?.({
        createLeagueAndTeams: { league: { id: 42, name: 'Test League' } },
      });
      return Promise.resolve({
        data: {
          createLeagueAndTeams: { league: { id: 42, name: 'Test League' } },
        },
      });
    });
    return [mockCreateLeagueMutate, mockCreateLeagueState];
  },
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeForm(overrides: Record<string, unknown> = {}) {
  return {
    leagueName: '  Diamond Dynasty  ',
    numberOfTeams: 12,
    numberOfDivisions: 2,
    isPublic: true,
    schedulingStrategy: 'divisional' as const,
    maxRosterSize: 25,
    playerPool: 'all',
    draftMode: 'live' as const,
    selectionMethod: 'standard' as const,
    draftOrder: 'snake' as const,
    draftDate: new Date('2030-08-08T19:00:00.000Z'),
    auctionBudget: 200,
    auctionMinBid: 1,
    allowDraftSlotTrading: false,
    baseballEraFilter: 'all',
    customEraStartYear: undefined,
    customEraEndYear: undefined,
    baseballHofOnly: false,
    waiverType: 'standard' as const,
    faabBudgetDefault: 100,
    salaryCapEnabled: false,
    salaryCap: undefined,
    scoringFormat: 'ppr' as const,
    defensiveFormat: 'dst' as const,
    ...overrides,
  };
}

/** Renders the screen and returns the props the wizard was handed. */
function renderScreen(): WizardProps {
  render(<CreateLeagueScreen />);
  if (!wizardProps) throw new Error('LeagueCreateWizard did not render');
  return wizardProps;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CreateLeagueScreen — wizard wiring (LS-8809)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wizardProps = undefined;
    mockIsPremium = false;
    mockPremiumLoading = false;
    mockSearchParams = {};
    mockCreateLeagueState.loading = false;
    mockCreateLeagueState.error = undefined;
  });

  describe('sport routing', () => {
    it('defaults to baseball when no sport param is present', () => {
      expect(renderScreen().sport).toBe('baseball');
    });

    it('reads football from the ?sport= param', () => {
      mockSearchParams = { sport: 'football' };
      expect(renderScreen().sport).toBe('football');
    });

    it('falls back to baseball for an unrecognized sport param', () => {
      mockSearchParams = { sport: 'cricket' };
      expect(renderScreen().sport).toBe('baseball');
    });
  });

  it('passes the ?name= prefill through to the wizard', () => {
    mockSearchParams = { name: 'Diamond Dynasty' };
    expect(renderScreen().initialLeagueName).toBe('Diamond Dynasty');
  });

  it('forwards subscription state so premium controls can gate themselves', () => {
    mockIsPremium = true;
    mockPremiumLoading = true;
    const props = renderScreen();
    expect(props.isPremium).toBe(true);
    expect(props.premiumLoading).toBe(true);
  });

  it('reports mutation in-flight and error state to the wizard', () => {
    mockCreateLeagueState.loading = true;
    mockCreateLeagueState.error = { message: 'League name is taken' };
    const props = renderScreen();
    expect(props.submitting).toBe(true);
    expect(props.submitError).toBe('League name is taken');
  });

  describe('submit', () => {
    it('sends the assembled input and routes to the new baseball league', async () => {
      const props = renderScreen();
      props.onSubmit(makeForm());

      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/baseball/league/42');
      });
    });

    it('routes to the football league when entered from the football wrapper', async () => {
      mockSearchParams = { sport: 'football' };
      const props = renderScreen();
      props.onSubmit(makeForm());

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/football/league/42');
      });
    });
  });

  describe('close', () => {
    it('leaves immediately when nothing has been edited', () => {
      renderScreen().onClose(false);
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/baseball');
    });

    it('confirms before discarding unsaved edits', () => {
      renderScreen().onClose(true);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Discard league setup?',
        'Your settings will be lost.',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('navigates once the discard action is confirmed', () => {
      renderScreen().onClose(true);
      const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
      buttons?.find((b) => b.text === 'Discard')?.onPress?.();
      expect(mockNavigate).toHaveBeenCalledWith('/baseball');
    });
  });

  it('tracks a premium tap then routes to subscription settings', () => {
    const { trackPremiumFeatureClick } = jest.requireMock<{
      trackPremiumFeatureClick: jest.Mock;
    }>('../../../utils/analytics');

    renderScreen().onUpgrade('Salary Cap');

    expect(trackPremiumFeatureClick).toHaveBeenCalledWith('Salary Cap');
    expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
  });
});

describe('buildCreateLeagueInput', () => {
  it('trims the league name and sends the five new parity fields', () => {
    const input = buildCreateLeagueInput(makeForm(), 'baseball');
    expect(input.leagueName).toBe('Diamond Dynasty');
    expect(input.numberOfDivisions).toBe(2);
    expect(input.isPublic).toBe(true);
    expect(input.schedulingStrategy).toBe('divisional');
    expect(input.baseballHofOnly).toBe(false);
  });

  it('sends auction budget and minimum bid only for an auction draft', () => {
    const standard = buildCreateLeagueInput(makeForm(), 'baseball');
    expect(standard.auctionBudget).toBeUndefined();
    expect(standard.auctionMinBid).toBeUndefined();

    const auction = buildCreateLeagueInput(
      makeForm({
        selectionMethod: 'auction',
        auctionBudget: 300,
        auctionMinBid: 5,
      }),
      'baseball',
    );
    expect(auction.auctionBudget).toBe(300);
    expect(auction.auctionMinBid).toBe(5);
  });

  it('never sends draft-slot trading for an auction league (LS-8675)', () => {
    const input = buildCreateLeagueInput(
      makeForm({ selectionMethod: 'auction', allowDraftSlotTrading: true }),
      'baseball',
    );
    expect(input.allowDraftSlotTrading).toBeUndefined();
  });

  it('sends draft-slot trading when enabled on a non-auction league', () => {
    const input = buildCreateLeagueInput(
      makeForm({ allowDraftSlotTrading: true }),
      'baseball',
    );
    expect(input.allowDraftSlotTrading).toBe(true);
  });

  it('sends custom-era bounds only when the custom era is selected', () => {
    const preset = buildCreateLeagueInput(
      makeForm({ customEraStartYear: 1940, customEraEndYear: 1950 }),
      'baseball',
    );
    expect(preset.customEraStartYear).toBeUndefined();

    const custom = buildCreateLeagueInput(
      makeForm({
        baseballEraFilter: 'custom',
        customEraStartYear: 1940,
        customEraEndYear: 1950,
      }),
      'baseball',
    );
    expect(custom.customEraStartYear).toBe(1940);
    expect(custom.customEraEndYear).toBe(1950);
  });

  it('sends the FAAB budget only for FAAB waivers', () => {
    expect(
      buildCreateLeagueInput(makeForm(), 'baseball').faabBudgetDefault,
    ).toBeUndefined();
    expect(
      buildCreateLeagueInput(makeForm({ waiverType: 'faab' }), 'baseball')
        .faabBudgetDefault,
    ).toBe(100);
  });

  it('sends the salary cap amount only when the cap is enabled', () => {
    expect(
      buildCreateLeagueInput(
        makeForm({ salaryCapEnabled: false, salaryCap: 5_000_000 }),
        'baseball',
      ).salaryCap,
    ).toBeUndefined();
    expect(
      buildCreateLeagueInput(
        makeForm({ salaryCapEnabled: true, salaryCap: 5_000_000 }),
        'baseball',
      ).salaryCap,
    ).toBe(5_000_000);
  });

  it('sends football scoring fields and omits the baseball-only ones', () => {
    const input = buildCreateLeagueInput(
      makeForm({ defensiveFormat: 'idp' }),
      'football',
    );
    expect(input.sport).toBe('football');
    expect(input.scoringFormat).toBe('ppr');
    expect(input.defensiveFormat).toBe('idp');
    expect(input.eraFilter).toBeUndefined();
    expect(input.baseballHofOnly).toBeUndefined();
    expect(input.salaryCapEnabled).toBeUndefined();
  });

  it('serializes the draft date as an ISO start date', () => {
    expect(buildCreateLeagueInput(makeForm(), 'baseball').startDate).toBe(
      '2030-08-08T19:00:00.000Z',
    );
  });
});

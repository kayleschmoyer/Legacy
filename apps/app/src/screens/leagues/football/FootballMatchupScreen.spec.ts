import {
  getFlexSubLabel,
  getPlayerName,
  getPlayerPosition,
} from './FootballMatchupScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@legacy-sports/shared-components', () => ({
  useWebSocket: jest.fn(() => ({ connected: false })),
}));

jest.mock('@legacy-sports/app-config/native', () => ({
  config: { websocketUrl: undefined },
}));

jest.mock('../../../common/auth/AuthHooks', () => ({
  readKeychainValue: jest.fn().mockResolvedValue(undefined),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

jest.mock('../../../features/subscription/useSubscription', () => ({
  useHasEntitlement: jest.fn(() => true),
}));

jest.mock('../../../features/subscription/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: unknown }) => children,
}));

jest.mock('@legacy-sports/shared-components/matchup', () => ({
  MatchupRecapPanel: () => null,
}));

jest.mock('@legacy-sports/utils', () => ({
  ENTITLEMENTS: { ai_matchup_recap: 'ai_matchup_recap' },
  ALLOWED_POSITIONS_BY_SPORT: {
    football: {
      QB: ['QB'],
      RB: ['RB'],
      WR: ['WR'],
      TE: ['TE'],
      K: ['K'],
      DST: ['DST'],
      DL: ['DL'],
      LB: ['LB'],
      DB: ['DB'],
      FLEX: ['RB', 'WR', 'TE'],
      SFLEX: ['QB', 'RB', 'WR', 'TE'],
    },
  },
}));

describe('getFlexSubLabel', () => {
  it('lists accepted positions for FLEX', () => {
    expect(getFlexSubLabel('FLEX')).toBe('RB/WR/TE');
  });

  it('lists accepted positions for SFLEX', () => {
    expect(getFlexSubLabel('SFLEX')).toBe('QB/RB/WR/TE');
  });

  it('returns undefined for single-position slots', () => {
    expect(getFlexSubLabel('QB')).toBeUndefined();
    expect(getFlexSubLabel('TE')).toBeUndefined();
  });

  it('returns undefined for an unknown slot', () => {
    expect(getFlexSubLabel('BN')).toBeUndefined();
  });
});

describe('getPlayerName', () => {
  it('returns full name when both firstName and lastName are present', () => {
    expect(
      getPlayerName({
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: ['QB'],
      }),
    ).toBe('Patrick Mahomes');
  });

  it('returns firstName only when lastName is null', () => {
    expect(
      getPlayerName({
        firstName: 'Patrick',
        lastName: null,
        eligiblePositions: [],
      }),
    ).toBe('Patrick');
  });

  it('returns Empty when player is null', () => {
    expect(getPlayerName(null)).toBe('Empty');
  });

  it('returns Unknown when both names are null', () => {
    expect(
      getPlayerName({ firstName: null, lastName: null, eligiblePositions: [] }),
    ).toBe('Unknown');
  });
});

describe('getPlayerPosition', () => {
  it('returns first eligible position', () => {
    expect(
      getPlayerPosition({
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: ['QB', 'FLEX'],
      }),
    ).toBe('QB');
  });

  it('returns em dash when eligiblePositions is empty', () => {
    expect(
      getPlayerPosition({
        firstName: 'Patrick',
        lastName: 'Mahomes',
        eligiblePositions: [],
      }),
    ).toBe('—');
  });

  it('returns em dash when player is null', () => {
    expect(getPlayerPosition(null)).toBe('—');
  });
});

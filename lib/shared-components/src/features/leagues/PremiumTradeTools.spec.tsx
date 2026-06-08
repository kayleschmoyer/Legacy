import React from 'react';
import { getVerdict, PremiumTradeTools, tradeValue } from './PremiumTradeTools';
import { render } from '../../test-utils';
import type { TradeOfferFragment } from '../../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEAGUE_ID = 10;
const USER_TEAM_ID = 1;
const OTHER_TEAM_ID = 2;

function makeOffer(
  overrides: Partial<TradeOfferFragment> & { id: number },
): TradeOfferFragment {
  return {
    __typename: 'TradeOffer',
    leagueId: LEAGUE_ID,
    proposingTeamId: OTHER_TEAM_ID,
    receivingTeamId: USER_TEAM_ID,
    proposingTeamName: 'Sluggers',
    receivingTeamName: 'Home Runners',
    status: 'pending',
    message: null,
    expiresAt: null,
    respondedAt: null,
    vetoedAt: null,
    createdAt: '2026-03-18T14:30:00Z',
    updatedAt: '2026-03-18T14:30:00Z',
    players: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// tradeValue — unit tests
// ---------------------------------------------------------------------------

describe('tradeValue', () => {
  it('returns 0 for an empty player list', () => {
    expect(tradeValue([])).toBe(0);
  });

  it('uses the default value for an unknown position', () => {
    expect(tradeValue([{ playerPosition: 'UNKNOWN' }])).toBe(6.0);
  });

  it('uses the default value for a null position', () => {
    expect(tradeValue([{ playerPosition: null }])).toBe(6.0);
  });

  it('uses the default value for an undefined position', () => {
    expect(tradeValue([{ playerPosition: undefined }])).toBe(6.0);
  });

  it('returns correct value for a known baseball position (SP = 8.5)', () => {
    expect(tradeValue([{ playerPosition: 'SP' }])).toBe(8.5);
  });

  it('returns correct value for a known football position (QB = 9.0)', () => {
    expect(tradeValue([{ playerPosition: 'QB' }])).toBe(9.0);
  });

  it('sums values for multiple players', () => {
    const players = [
      { playerPosition: 'SP' }, // 8.5
      { playerPosition: 'SS' }, // 8.0
      { playerPosition: 'C' }, // 7.5
    ];
    expect(tradeValue(players)).toBeCloseTo(24.0);
  });

  it('is case-insensitive for position strings', () => {
    expect(tradeValue([{ playerPosition: 'sp' }])).toBe(8.5);
    expect(tradeValue([{ playerPosition: 'Qb' }])).toBe(9.0);
  });
});

// ---------------------------------------------------------------------------
// getVerdict — unit tests
// ---------------------------------------------------------------------------

describe('getVerdict', () => {
  it('returns "fair" when values are equal', () => {
    expect(getVerdict(10, 10)).toBe('fair');
  });

  it('returns "fair" when difference is under 5%', () => {
    expect(getVerdict(10, 10.4)).toBe('fair');
  });

  it('returns "slight-edge-you" for a modest gain (5–20%)', () => {
    expect(getVerdict(10, 11)).toBe('slight-edge-you');
  });

  it('returns "strong-edge-you" for a large gain (>20%)', () => {
    expect(getVerdict(10, 13)).toBe('strong-edge-you');
  });

  it('returns "slight-edge-them" for a modest loss (5–20%)', () => {
    expect(getVerdict(10, 9)).toBe('slight-edge-them');
  });

  it('returns "strong-edge-them" for a large loss (>20%)', () => {
    expect(getVerdict(10, 7)).toBe('strong-edge-them');
  });

  it('handles zero give value without dividing by zero', () => {
    const result = getVerdict(0, 10);
    expect(['strong-edge-you', 'slight-edge-you', 'fair']).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// PremiumTradeTools — nullable field rendering
// ---------------------------------------------------------------------------

describe('PremiumTradeTools — null / undefined TradeOfferFragment fields', () => {
  it('renders without error when players array is empty', async () => {
    const offer = makeOffer({ id: 1, players: [] });
    const { findByText } = render(
      <PremiumTradeTools
        userTeamId={USER_TEAM_ID}
        pendingTrades={[offer]}
        isPremium
      />,
    );
    // Expand the section
    (await findByText('Premium Trade Tools')).click();
    // Trade selector for the offer is visible
    expect(await findByText('Sluggers')).toBeTruthy();
  });

  it('shows "—" for the empty side when only one direction has players', async () => {
    const offer = makeOffer({
      id: 1,
      players: [
        {
          __typename: 'TradeOfferPlayer',
          id: 1,
          tradeOfferId: 1,
          playerId: 100,
          fromTeamId: OTHER_TEAM_ID,
          playerName: 'Mike Trout',
          playerPosition: 'CF',
        },
      ],
    });
    const { findByText, findAllByText } = render(
      <PremiumTradeTools
        userTeamId={USER_TEAM_ID}
        pendingTrades={[offer]}
        isPremium
      />,
    );
    (await findByText('Premium Trade Tools')).click();
    // Select the offer to open the analysis panel
    (await findByText('Sluggers')).click();
    // "You Give" side is empty → renders an em-dash
    const dashes = await findAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('handles null playerName gracefully (shows "Unknown")', async () => {
    const offer = makeOffer({
      id: 2,
      players: [
        {
          __typename: 'TradeOfferPlayer',
          id: 1,
          tradeOfferId: 2,
          playerId: 101,
          fromTeamId: USER_TEAM_ID,
          playerName: null,
          playerPosition: 'SS',
        },
      ],
    });
    const { findByText } = render(
      <PremiumTradeTools
        userTeamId={USER_TEAM_ID}
        pendingTrades={[offer]}
        isPremium
      />,
    );
    (await findByText('Premium Trade Tools')).click();
    (await findByText('Sluggers')).click();
    expect(await findByText('Unknown')).toBeTruthy();
  });

  it('uses default value and renders correctly when playerPosition is null', async () => {
    const offer = makeOffer({
      id: 3,
      players: [
        {
          __typename: 'TradeOfferPlayer',
          id: 1,
          tradeOfferId: 3,
          playerId: 102,
          fromTeamId: USER_TEAM_ID,
          playerName: 'Mystery Player',
          playerPosition: null,
        },
      ],
    });
    const { findByText } = render(
      <PremiumTradeTools
        userTeamId={USER_TEAM_ID}
        pendingTrades={[offer]}
        isPremium
      />,
    );
    (await findByText('Premium Trade Tools')).click();
    (await findByText('Sluggers')).click();
    // Player name is visible — default value used, no crash
    expect(await findByText('Mystery Player')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PremiumTradeTools — premium gate
// ---------------------------------------------------------------------------

describe('PremiumTradeTools — premium gate', () => {
  it('does not show gate overlay for premium users', async () => {
    const offer = makeOffer({ id: 1, players: [] });
    const { findByText, queryByTestId } = render(
      <PremiumTradeTools
        userTeamId={USER_TEAM_ID}
        pendingTrades={[offer]}
        isPremium
      />,
    );
    (await findByText('Premium Trade Tools')).click();
    expect(queryByTestId('premium-trade-tools-gate')).toBeNull();
  });

  it('shows gate overlay for non-premium users', async () => {
    const offer = makeOffer({ id: 1, players: [] });
    const { findByText, findByTestId } = render(
      <PremiumTradeTools
        userTeamId={USER_TEAM_ID}
        pendingTrades={[offer]}
        isPremium={false}
      />,
    );
    (await findByText('Premium Trade Tools')).click();
    expect(await findByTestId('premium-trade-tools-gate')).toBeTruthy();
  });

  it('calls onUpgrade when upgrade button is pressed', async () => {
    const onUpgrade = jest.fn();
    const offer = makeOffer({ id: 1, players: [] });
    const { findByText } = render(
      <PremiumTradeTools
        userTeamId={USER_TEAM_ID}
        pendingTrades={[offer]}
        isPremium={false}
        onUpgrade={onUpgrade}
      />,
    );
    (await findByText('Premium Trade Tools')).click();
    const btn = (await findByText('Upgrade to Premium')).closest('button');
    btn?.click();
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});

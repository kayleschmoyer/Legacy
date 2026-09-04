/**
 * Regression gate for LS-4825:
 *
 * The DraftIntelligence panel renders rank labels (`#1`, `#2`, …) from the
 * array index, so the array must be ordered by `score` descending. If the
 * server response or Apollo cache write surfaces the items in a different
 * order (e.g. alphabetical), the panel must still re-sort defensively before
 * rendering.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { GetDraftRecommendations } from '@legacy-sports/graphql';
import { DraftIntelligence } from './DraftIntelligence';
import { MockedProvider } from '../../test-utils/MockedProvider';

const variables = { draftId: 1, teamId: 2 };

const makeRec = (
  playerId: number,
  playerName: string,
  score: number,
  position = '1B',
  signal: string | null = null,
) => ({
  __typename: 'DraftRecommendation' as const,
  playerId,
  playerName,
  position,
  score,
  reason: `score ${score}`,
  signal,
  topStats: [
    {
      __typename: 'DraftRecommendationStat' as const,
      label: 'HR',
      value: '30',
    },
  ],
});

function makeErrorMock(
  code: string,
  message: string,
): Parameters<typeof MockedProvider>[0]['mocks'] {
  return [
    {
      request: { query: GetDraftRecommendations, variables },
      error: new CombinedGraphQLErrors({
        errors: [{ message, extensions: { code } }],
      }),
    },
  ];
}

function makeMock(
  recs: ReturnType<typeof makeRec>[],
): Parameters<typeof MockedProvider>[0]['mocks'] {
  return [
    {
      request: { query: GetDraftRecommendations, variables },
      result: { data: { getDraftRecommendations: recs } },
    },
  ];
}

describe('DraftIntelligence sort', () => {
  it('renders recommendations sorted by score descending when server order is correct', async () => {
    const recs = [
      makeRec(1, 'Mike Trout', 95),
      makeRec(2, 'Freddie Freeman', 88),
      makeRec(3, 'Aaron Judge', 80),
    ];
    render(
      <MockedProvider mocks={makeMock(recs)} addTypename={false}>
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Mike Trout')).toBeTruthy();
    });
    const names = screen.getAllByText(/Trout|Freeman|Judge/);
    expect(names.map((n) => n.textContent)).toEqual([
      'Mike Trout',
      'Freddie Freeman',
      'Aaron Judge',
    ]);
  });

  it('re-sorts by score even when the server returns items in alphabetical order', async () => {
    // Reverse-sorted by score (alphabetical by first name) — what the LS-4825
    // bug report described seeing on mobile.
    const recs = [
      makeRec(3, 'Aaron Judge', 80),
      makeRec(2, 'Freddie Freeman', 88),
      makeRec(1, 'Mike Trout', 95),
    ];
    render(
      <MockedProvider mocks={makeMock(recs)} addTypename={false}>
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Mike Trout')).toBeTruthy();
    });
    const names = screen.getAllByText(/Trout|Freeman|Judge/);
    expect(names.map((n) => n.textContent)).toEqual([
      'Mike Trout',
      'Freddie Freeman',
      'Aaron Judge',
    ]);
  });
});

/**
 * Signal chip coverage (LS-9855).
 *
 * The chip is the panel's at-a-glance label; it must render the mapped text
 * for a known signal, and render nothing at all when the server sends none —
 * a fabricated fallback label would read as a real finding (LS-9473).
 */
describe('DraftIntelligence signal chip', () => {
  it.each([
    ['POS_RUN', 'POS RUN'],
    ['TIER_BREAK', 'TIER BREAK'],
    ['ROSTER_FIT', 'ROSTER FIT'],
    ['VALUE', 'VALUE'],
  ])('renders the %s chip as "%s"', async (signal, label) => {
    const recs = [makeRec(1, 'Lou Gehrig', 95, '1B', signal)];
    render(
      <MockedProvider mocks={makeMock(recs)} addTypename={false}>
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Lou Gehrig')).toBeTruthy();
    });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('omits the chip entirely when the signal is null', async () => {
    const recs = [makeRec(1, 'Lou Gehrig', 95, '1B', null)];
    render(
      <MockedProvider mocks={makeMock(recs)} addTypename={false}>
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Lou Gehrig')).toBeTruthy();
    });
    for (const label of ['POS RUN', 'TIER BREAK', 'ROSTER FIT', 'VALUE']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('omits the chip for a signal value this client does not know', async () => {
    // A server deployed ahead of the app must not surface a raw enum token.
    const recs = [makeRec(1, 'Lou Gehrig', 95, '1B', 'SOME_FUTURE_SIGNAL')];
    render(
      <MockedProvider mocks={makeMock(recs)} addTypename={false}>
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Lou Gehrig')).toBeTruthy();
    });
    expect(screen.queryByText('SOME_FUTURE_SIGNAL')).toBeNull();
  });
});

/**
 * LS-9861: `getDraftRecommendations` is gated server-side on
 * ENTITLEMENTS.draft_recommendations, so an unentitled caller gets a
 * PREMIUM_REQUIRED rejection with no data. The panel used to drop that on the
 * floor (it never destructured `error`) and return null, making the premium
 * rejection indistinguishable from "no recommendations right now" — the whole
 * feature silently vanished with no upsell.
 */
describe('DraftIntelligence premium gating', () => {
  it('renders the shared PremiumGate locked card on PREMIUM_REQUIRED', async () => {
    render(
      <MockedProvider
        mocks={makeErrorMock(
          'PREMIUM_REQUIRED',
          'Draft recommendations requires a Premium subscription',
        )}
        addTypename={false}
      >
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    // "Draft recommendations" is ENTITLEMENT_LABELS.draft_recommendations —
    // the same catalog string the server's gate error uses.
    await waitFor(() => {
      expect(screen.getByText('Draft recommendations')).toBeTruthy();
    });
    expect(screen.getByText('Available with Premium leagues.')).toBeTruthy();
  });

  it('renders nothing for an entitled user with no recommendations, so the empty state stays distinguishable from the gate', async () => {
    const { container } = render(
      <MockedProvider mocks={makeMock([])} addTypename={false}>
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    expect(screen.queryByText('Draft recommendations')).toBeNull();
  });

  it('does not swallow other error classes into the upsell', async () => {
    const { container } = render(
      <MockedProvider
        mocks={makeErrorMock('INTERNAL_SERVER_ERROR', 'Internal server error')}
        addTypename={false}
      >
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    expect(screen.queryByText('Draft recommendations')).toBeNull();
  });

  it('does not show the upsell for ENTITLEMENTS_STALE, which is a token-refresh signal rather than a not-entitled verdict', async () => {
    // Both Apollo links absorb ENTITLEMENTS_STALE with a bounded re-mint +
    // replay (LS-9067). If one ever reaches the component, it must not be
    // mislabelled as a downgrade — the user may well be entitled.
    const { container } = render(
      <MockedProvider
        mocks={makeErrorMock('ENTITLEMENTS_STALE', 'Entitlements are stale')}
        addTypename={false}
      >
        <DraftIntelligence draftId={1} teamId={2} currentOverallPick={0} />
      </MockedProvider>,
    );
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    expect(screen.queryByText('Draft recommendations')).toBeNull();
  });
});

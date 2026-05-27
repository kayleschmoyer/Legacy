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
import { DraftIntelligence } from './DraftIntelligence';
import { GetDraftRecommendations } from '../../api/db/graphql.generated';
import { MockedProvider } from '../../test-utils/MockedProvider';

const variables = { draftId: 1, teamId: 2 };

const makeRec = (
  playerId: number,
  playerName: string,
  score: number,
  position = '1B',
) => ({
  __typename: 'DraftRecommendation' as const,
  playerId,
  playerName,
  position,
  score,
  reason: `score ${score}`,
  topStats: [
    {
      __typename: 'DraftRecommendationStat' as const,
      label: 'HR',
      value: '30',
    },
  ],
});

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

/**
 * Regression gate for LS-4804: the draft-queue resolver allows only the team
 * general manager to read the queue and throws FORBIDDEN otherwise. The UI
 * must skip the query entirely for non-GMs so the rejected request never
 * reaches Rollbar in production.
 */
import React from 'react';
import { useQuery as apolloUseQuery } from '@apollo/client/react';
import { DraftQueuePanel } from './DraftQueuePanel';
import { render } from '../../test-utils';

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(() => [jest.fn(), { loading: false }]),
}));

jest.mock('@legacy-sports/graphql', () => ({
  GetMyDraftQueue: 'GetMyDraftQueue',
  RemoveFromDraftQueue: 'RemoveFromDraftQueue',
  ReorderDraftQueue: 'ReorderDraftQueue',
}));

const useQueryMock = apolloUseQuery as unknown as jest.Mock;

beforeEach(() => {
  useQueryMock.mockReset();
  useQueryMock.mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  });
});

describe('DraftQueuePanel (LS-4804)', () => {
  it('skips the GraphQL query when enabled is false', () => {
    const { container } = render(
      <DraftQueuePanel draftId={1} enabled={false} />,
    );

    expect(container.firstChild).toBeNull();
    expect(useQueryMock).toHaveBeenCalledTimes(1);
    const [, options] = useQueryMock.mock.calls[0] as [
      unknown,
      { skip: boolean },
    ];
    expect(options.skip).toBe(true);
  });

  it('fires the query when enabled (default)', () => {
    render(<DraftQueuePanel draftId={42} />);

    const [, options] = useQueryMock.mock.calls[0] as [
      unknown,
      { skip: boolean },
    ];
    expect(options.skip).toBe(false);
  });

  it('renders nothing when the server returns FORBIDDEN as a safety net', () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      loading: false,
      error: {
        graphQLErrors: [{ extensions: { code: 'FORBIDDEN' } }],
      },
      refetch: jest.fn(),
    });

    const { container } = render(<DraftQueuePanel draftId={1} />);
    expect(container.firstChild).toBeNull();
  });
});

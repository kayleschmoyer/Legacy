/**
 * Regression gate for LS-4804: the draft-queue resolver allows only the team
 * general manager to read the queue and throws FORBIDDEN otherwise. The UI
 * must skip the query entirely for non-GMs so the rejected request never
 * reaches Rollbar in production.
 */
import React from 'react';
import {
  useMutation as apolloUseMutation,
  useQuery as apolloUseQuery,
} from '@apollo/client/react';
import { act, screen } from '@testing-library/react';
import { DraftQueuePanel } from './DraftQueuePanel';
import { render } from '../../test-utils';

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(() => [jest.fn(), { loading: false }]),
}));

// Captures the real `onDragEnd` callback DraftQueuePanel passes to
// DndContext so tests can drive the actual reorder logic directly, without
// simulating real pointer/keyboard drag gestures (unreliable in jsdom, which
// reports zero-sized layout rects). Everything else from @dnd-kit/core
// (useSensor(s), sensor classes, etc.) stays real.
let capturedOnDragEnd: ((event: unknown) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual: object = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd: (event: unknown) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      return children;
    },
  };
});

jest.mock('@legacy-sports/graphql', () => ({
  GetMyDraftQueue: 'GetMyDraftQueue',
  RemoveFromDraftQueue: 'RemoveFromDraftQueue',
  ReorderDraftQueue: 'ReorderDraftQueue',
}));

const useQueryMock = apolloUseQuery as unknown as jest.Mock;
const useMutationMock = apolloUseMutation as unknown as jest.Mock;

beforeEach(() => {
  useQueryMock.mockReset();
  useQueryMock.mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  });
  useMutationMock.mockReset();
  useMutationMock.mockReturnValue([jest.fn(), { loading: false }]);
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

describe('DraftQueuePanel drag-to-sort (LS-8786)', () => {
  const entries = [
    {
      id: 1,
      draftId: 1,
      teamId: 1,
      playerId: 101,
      priority: 1,
      player: { id: 101, firstName: 'Lou', lastName: 'Gehrig' },
    },
    {
      id: 2,
      draftId: 1,
      teamId: 1,
      playerId: 102,
      priority: 2,
      player: { id: 102, firstName: 'Rogers', lastName: 'Hornsby' },
    },
  ];

  beforeEach(() => {
    useQueryMock.mockReturnValue({
      data: { getMyDraftQueue: entries },
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });
  });

  it('renders a drag handle for each queued entry', () => {
    render(<DraftQueuePanel draftId={1} />);

    expect(
      screen.getByLabelText('Drag to reorder Lou Gehrig'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Drag to reorder Rogers Hornsby'),
    ).toBeInTheDocument();
  });

  it('renders entries in priority order with rank numbers', () => {
    render(<DraftQueuePanel draftId={1} />);

    expect(
      screen.getByLabelText('Queue position 1: Lou Gehrig'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Queue position 2: Rogers Hornsby'),
    ).toBeInTheDocument();
  });

  it('calls the remove mutation when the remove button is clicked', () => {
    const removeMutation = jest.fn().mockResolvedValue({});
    useMutationMock.mockImplementation((doc: unknown) => {
      if (doc === 'RemoveFromDraftQueue') {
        return [removeMutation, { loading: false }];
      }
      return [jest.fn(), { loading: false }];
    });

    render(<DraftQueuePanel draftId={1} />);

    screen.getByLabelText('Remove Lou Gehrig from queue').click();

    expect(removeMutation).toHaveBeenCalledWith({
      variables: { draftId: 1, playerId: 101 },
    });
  });

  it('optimistically reorders and calls reorderQueue with the new player order on drag end', () => {
    const reorderMutation = jest.fn().mockResolvedValue({});
    useMutationMock.mockImplementation((doc: unknown) => {
      if (doc === 'ReorderDraftQueue') {
        return [reorderMutation, { loading: false }];
      }
      return [jest.fn(), { loading: false }];
    });

    render(<DraftQueuePanel draftId={1} />);

    expect(capturedOnDragEnd).not.toBeNull();
    act(() => {
      capturedOnDragEnd?.({ active: { id: '1' }, over: { id: '2' } });
    });

    // The optimistic reorder happens synchronously, before the mutation
    // resolves — position 1 becomes Hornsby immediately.
    expect(
      screen.getByLabelText('Queue position 1: Rogers Hornsby'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Queue position 2: Lou Gehrig'),
    ).toBeInTheDocument();

    expect(reorderMutation).toHaveBeenCalledWith({
      variables: { draftId: 1, playerIds: [102, 101] },
    });
  });

  it('is a no-op when dropped back on the same position', () => {
    const reorderMutation = jest.fn();
    useMutationMock.mockImplementation((doc: unknown) => {
      if (doc === 'ReorderDraftQueue') {
        return [reorderMutation, { loading: false }];
      }
      return [jest.fn(), { loading: false }];
    });

    render(<DraftQueuePanel draftId={1} />);

    act(() => {
      capturedOnDragEnd?.({ active: { id: '1' }, over: { id: '1' } });
    });

    expect(reorderMutation).not.toHaveBeenCalled();
  });

  it('reverts the optimistic reorder and surfaces an error when the mutation fails', async () => {
    const reorderMutation = jest.fn().mockRejectedValue(new Error('boom'));
    const onError = jest.fn();
    useMutationMock.mockImplementation((doc: unknown) => {
      if (doc === 'ReorderDraftQueue') {
        return [reorderMutation, { loading: false }];
      }
      return [jest.fn(), { loading: false }];
    });

    render(<DraftQueuePanel draftId={1} onError={onError} />);

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: '1' }, over: { id: '2' } });
      // Flush the reorderQueue promise's .catch()/.finally() chain.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onError).toHaveBeenCalledWith(
      'Failed to reorder queue. Please try again.',
    );
    // Reverted back to the last known server order, not left showing the
    // reorder that never actually persisted.
    expect(
      screen.getByLabelText('Queue position 1: Lou Gehrig'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Queue position 2: Rogers Hornsby'),
    ).toBeInTheDocument();
  });
});

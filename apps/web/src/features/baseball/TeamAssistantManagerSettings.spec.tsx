/**
 * Tests for TeamAssistantManagerSettings.
 *
 * LS-6027 — clicking "Remove" must not fire the remove mutation immediately;
 * it must open a confirmation dialog, and only call the mutation once the
 * user confirms.
 *
 * LS-6028 — coverage for the remaining untested paths: empty state,
 * populated list, successful invite, error on duplicate invite, error on
 * self-invite, error on remove, and the loading spinners shown while an
 * invite/remove is in flight.
 */
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { TeamAssistantManagerSettings } from './TeamAssistantManagerSettings';

interface WithChildren {
  children?: React.ReactNode;
}
interface DialogProps extends WithChildren {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
interface ButtonProps extends WithChildren {
  onPress?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  'aria-label'?: string;
}

interface LeagueMember {
  userId: number;
  username: string;
  permissionLevel: string;
}

let mockMembersResult: {
  data: { teamLeagueMembers: LeagueMember[] } | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: jest.Mock;
};
let mockRefetchMembers: jest.Mock;
let mockInviteFn: jest.Mock;
let mockInviteLoading: boolean;
let mockRemoveFn: jest.Mock;
let mockRemoveLoading: boolean;

jest.mock('tamagui', () => {
  const Dialog = Object.assign(
    ({ children, open }: DialogProps) =>
      open ? <div role="dialog">{children}</div> : null,
    {
      Portal: ({ children }: WithChildren) => <div>{children}</div>,
      Overlay: () => null,
      Content: ({ children }: WithChildren) => <div>{children}</div>,
      Title: ({ children }: WithChildren) => <h2>{children}</h2>,
      Description: ({ children }: WithChildren) => <div>{children}</div>,
    },
  );

  return {
    Dialog,
    Button: ({
      children,
      onPress,
      disabled,
      icon,
      'aria-label': ariaLabel,
    }: ButtonProps) => (
      <button onClick={onPress} disabled={disabled} aria-label={ariaLabel}>
        {icon}
        {children}
      </button>
    ),
    Card: ({ children }: WithChildren) => <div>{children}</div>,
    H4: ({ children }: WithChildren) => <h4>{children}</h4>,
    Input: ({
      value,
      onChangeText,
      placeholder,
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      placeholder?: string;
    }) => (
      <input
        value={value ?? ''}
        onChange={(e) => onChangeText?.(e.target.value)}
        placeholder={placeholder}
      />
    ),
    Paragraph: ({ children }: WithChildren) => <p>{children}</p>,
    Separator: () => <hr />,
    Spinner: () => <span>loading</span>,
    Text: ({ children }: WithChildren) => <span>{children}</span>,
    XStack: ({ children }: WithChildren) => <div>{children}</div>,
    YStack: ({ children }: WithChildren) => <div>{children}</div>,
  };
});

jest.mock('@legacy-sports/graphql', () => ({
  useGetTeamLeagueMembersQuery: jest.fn(() => mockMembersResult),
  useInviteAssistantManagerMutation: jest.fn(() => [
    mockInviteFn,
    { loading: mockInviteLoading },
  ]),
  useRemoveAssistantManagerMutation: jest.fn(() => [
    mockRemoveFn,
    { loading: mockRemoveLoading },
  ]),
}));

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD_LIGHT: '#C5A55A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  BRAND_SEAM_RED: '#B0323C',
  withAlpha: (color: string): string => color,
}));

beforeEach(() => {
  jest.clearAllMocks();

  mockRefetchMembers = jest.fn().mockResolvedValue({});
  mockMembersResult = {
    data: {
      teamLeagueMembers: [
        { userId: 1, username: 'Alice', permissionLevel: 'assistant_manager' },
      ],
    },
    loading: false,
    error: undefined,
    refetch: mockRefetchMembers,
  };

  mockInviteFn = jest.fn().mockResolvedValue({});
  mockInviteLoading = false;

  mockRemoveFn = jest.fn().mockResolvedValue({});
  mockRemoveLoading = false;
});

describe('TeamAssistantManagerSettings – remove confirmation (LS-6027)', () => {
  it('does not call the remove mutation immediately on click, opens a confirmation dialog instead', () => {
    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );

    expect(mockRemoveFn).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/remove assistant manager\?/i)).toBeInTheDocument();
  });

  it('calls the remove mutation only after confirming', () => {
    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    expect(mockRemoveFn).toHaveBeenCalledWith({
      variables: { teamId: 1, userId: 1 },
    });
  });

  it('does not call the remove mutation when cancelled', () => {
    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockRemoveFn).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('TeamAssistantManagerSettings – member list states (LS-6028)', () => {
  it('shows an empty-state message when there are no assistant managers', () => {
    mockMembersResult = {
      data: { teamLeagueMembers: [] },
      loading: false,
      error: undefined,
      refetch: mockRefetchMembers,
    };

    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    expect(screen.getByText(/no assistant managers yet/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove assistant manager/i }),
    ).not.toBeInTheDocument();
  });

  it('renders each assistant manager with a remove button when the list is populated', () => {
    mockMembersResult = {
      data: {
        teamLeagueMembers: [
          {
            userId: 1,
            username: 'Alice',
            permissionLevel: 'assistant_manager',
          },
          { userId: 2, username: 'Bob', permissionLevel: 'assistant_manager' },
        ],
      },
      loading: false,
      error: undefined,
      refetch: mockRefetchMembers,
    };

    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove assistant manager bob/i }),
    ).toBeInTheDocument();
  });
});

describe('TeamAssistantManagerSettings – invite (LS-6028)', () => {
  it('invites a user by username and shows a success message', async () => {
    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    fireEvent.change(screen.getByPlaceholderText(/enter username/i), {
      target: { value: 'Charlie' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /send assistant manager invitation/i,
      }),
    );

    await waitFor(() => {
      expect(mockInviteFn).toHaveBeenCalledWith({
        variables: { teamId: 1, username: 'Charlie' },
      });
    });
    expect(
      await screen.findByText(
        /charlie has been added as an assistant manager/i,
      ),
    ).toBeInTheDocument();
    expect(mockRefetchMembers).toHaveBeenCalled();
  });

  it('shows an error when inviting a username that is already an assistant manager', async () => {
    mockInviteFn.mockRejectedValue(
      new Error('Alice is already an assistant manager for this team'),
    );

    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    fireEvent.change(screen.getByPlaceholderText(/enter username/i), {
      target: { value: 'Alice' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /send assistant manager invitation/i,
      }),
    );

    expect(
      await screen.findByText(
        /alice is already an assistant manager for this team/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows an error when inviting yourself', async () => {
    mockInviteFn.mockRejectedValue(
      new Error('You cannot invite yourself as an assistant manager'),
    );

    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    fireEvent.change(screen.getByPlaceholderText(/enter username/i), {
      target: { value: 'myself' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /send assistant manager invitation/i,
      }),
    );

    expect(
      await screen.findByText(
        /you cannot invite yourself as an assistant manager/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows a spinner and disables the invite button while the invite is in flight', () => {
    mockInviteLoading = true;

    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    const inviteButton = screen.getByRole('button', {
      name: /send assistant manager invitation/i,
    });

    expect(inviteButton).toBeDisabled();
    expect(within(inviteButton).getByText('loading')).toBeInTheDocument();
  });
});

describe('TeamAssistantManagerSettings – remove errors and loading (LS-6028)', () => {
  it('shows an error when removing an assistant manager fails', async () => {
    mockRemoveFn.mockRejectedValue(
      new Error(
        'Only the team General Manager or a league commissioner can remove assistant managers',
      ),
    );

    render(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    expect(
      await screen.findByText(
        /only the team general manager or a league commissioner can remove assistant managers/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a spinner and disables the confirm button while the removal is in flight', () => {
    const { rerender } = render(
      <TeamAssistantManagerSettings teamId={1} leagueId={1} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );
    const confirmButton = screen.getByRole('button', { name: /^remove$/i });

    mockRemoveLoading = true;
    rerender(<TeamAssistantManagerSettings teamId={1} leagueId={1} />);

    expect(confirmButton).toBeDisabled();
    expect(within(confirmButton).getByText('loading')).toBeInTheDocument();
  });
});

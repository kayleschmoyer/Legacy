/**
 * LS-6029: TeamAssistantManagerSettings is the cross-platform (Tamagui-only)
 * assistant manager list, giving mobile parity with web's bespoke feature
 * (LS-6027). These tests mirror web's coverage: the remove-confirmation
 * dialog gate, plus the invite flow.
 */
import React from 'react';
import { TeamAssistantManagerSettings } from './TeamAssistantManagerSettings';
import { act, fireEvent, render, screen } from '../../test-utils';

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
  'aria-label'?: string;
}
interface InputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}

let mockRemoveFn: jest.Mock = jest.fn();
let mockInviteFn: jest.Mock = jest.fn();
let mockRefetch: jest.Mock = jest.fn();

const mockUseGetTeamLeagueMembersQuery = jest.fn(() => ({
  data: {
    teamLeagueMembers: [
      { userId: 1, username: 'Alice', permissionLevel: 'assistant_manager' },
    ],
  },
  loading: false,
  error: undefined,
  refetch: mockRefetch,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetTeamLeagueMembersQuery: (...args: unknown[]) =>
    mockUseGetTeamLeagueMembersQuery(...args),
  useInviteAssistantManagerMutation: () => [mockInviteFn, { loading: false }],
  useRemoveAssistantManagerMutation: () => [mockRemoveFn, { loading: false }],
}));

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
    createTokens: (tokens: unknown) => tokens,
    Dialog,
    Button: ({
      children,
      onPress,
      disabled,
      'aria-label': ariaLabel,
    }: ButtonProps) => (
      <button onClick={onPress} disabled={disabled} aria-label={ariaLabel}>
        {children}
      </button>
    ),
    Card: ({ children }: WithChildren) => <div>{children}</div>,
    H4: ({ children }: WithChildren) => <h4>{children}</h4>,
    Input: ({
      value,
      onChangeText,
      placeholder,
      'aria-label': ariaLabel,
    }: InputProps) => (
      <input
        value={value ?? ''}
        onChange={(e) => onChangeText?.(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
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

describe('TeamAssistantManagerSettings — remove confirmation (LS-6029)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveFn = jest.fn().mockResolvedValue({});
    mockInviteFn = jest.fn().mockResolvedValue({});
    mockRefetch = jest.fn();
    mockUseGetTeamLeagueMembersQuery.mockReturnValue({
      data: {
        teamLeagueMembers: [
          {
            userId: 1,
            username: 'Alice',
            permissionLevel: 'assistant_manager',
          },
        ],
      },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
  });

  it('does not call the remove mutation immediately on click, opens a confirmation dialog instead', () => {
    render(<TeamAssistantManagerSettings teamId={1} />);

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );

    expect(mockRemoveFn).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/remove assistant manager\?/i)).toBeInTheDocument();
  });

  it('calls the remove mutation only after confirming', () => {
    render(<TeamAssistantManagerSettings teamId={1} />);

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    expect(mockRemoveFn).toHaveBeenCalledWith({
      variables: { teamId: 1, userId: 1 },
    });
  });

  it('does not call the remove mutation when cancelled', () => {
    render(<TeamAssistantManagerSettings teamId={1} />);

    fireEvent.click(
      screen.getByRole('button', { name: /remove assistant manager alice/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockRemoveFn).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no assistant managers', () => {
    mockUseGetTeamLeagueMembersQuery.mockReturnValue({
      data: { teamLeagueMembers: [] },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });

    render(<TeamAssistantManagerSettings teamId={1} />);

    expect(screen.getByText(/no assistant managers yet/i)).toBeInTheDocument();
  });
});

describe('TeamAssistantManagerSettings — invite (LS-6029)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveFn = jest.fn().mockResolvedValue({});
    mockInviteFn = jest.fn().mockResolvedValue({});
    mockRefetch = jest.fn();
    mockUseGetTeamLeagueMembersQuery.mockReturnValue({
      data: { teamLeagueMembers: [] },
      loading: false,
      error: undefined,
      refetch: mockRefetch,
    });
  });

  it('disables the invite button until a username is entered', () => {
    render(<TeamAssistantManagerSettings teamId={1} />);

    expect(
      screen.getByRole('button', {
        name: /send assistant manager invitation/i,
      }),
    ).toBeDisabled();
  });

  it('invites the trimmed username and clears the input on success', async () => {
    render(<TeamAssistantManagerSettings teamId={1} />);

    fireEvent.change(
      screen.getByLabelText(/username to invite as assistant manager/i),
      { target: { value: '  Bob  ' } },
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /send assistant manager invitation/i,
        }),
      );
      await Promise.resolve();
    });

    expect(mockInviteFn).toHaveBeenCalledWith({
      variables: { teamId: 1, username: 'Bob' },
    });
    expect(mockRefetch).toHaveBeenCalled();
    expect(
      screen.getByLabelText(/username to invite as assistant manager/i),
    ).toHaveValue('');
  });
});

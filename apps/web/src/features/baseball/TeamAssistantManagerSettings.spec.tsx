/**
 * Tests for TeamAssistantManagerSettings (LS-6027).
 *
 * Covers the confirmation-dialog fix: clicking "Remove" must no longer fire
 * the remove mutation immediately — it must open a confirmation dialog, and
 * only call the mutation once the user confirms.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  'aria-label'?: string;
}

let mockRemoveFn: jest.Mock = jest.fn();

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
  useGetTeamLeagueMembersQuery: jest.fn(() => ({
    data: {
      teamLeagueMembers: [
        { userId: 1, username: 'Alice', permissionLevel: 'assistant_manager' },
      ],
    },
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  })),
  useInviteAssistantManagerMutation: jest.fn(() => [
    jest.fn(),
    { loading: false },
  ]),
  useRemoveAssistantManagerMutation: jest.fn(() => [
    mockRemoveFn,
    { loading: false },
  ]),
}));

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD_LIGHT: '#C5A55A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  BRAND_SEAM_RED: '#B0323C',
  withAlpha: (color: string): string => color,
}));

describe('TeamAssistantManagerSettings – remove confirmation (LS-6027)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveFn = jest.fn().mockResolvedValue({});
  });

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

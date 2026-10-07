/**
 * LS-7236: an avatar preset pick saves immediately. Leaving the page while the
 * mutation is in flight must warn, and a success toast must appear even if the
 * component has already unmounted by the time the mutation resolves.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ProfileSettingsPage from './ProfileSettingsPage';

type ChildrenProps = { children?: React.ReactNode };
type PickerProps = { onSelect: (url: string | null) => void };

const mockShowToast = jest.fn();
const mockUpdateUserAvatar = jest.fn();
const mockRefetchUser = jest.fn();
let mockAvatarLoading = false;
let mockPickerProps: PickerProps | undefined;

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

jest.mock('@legacy-sports/shared-components/ui', () => {
  const Passthrough = ({ children }: ChildrenProps) => <div>{children}</div>;
  return {
    AvatarPicker: (props: PickerProps) => {
      mockPickerProps = props;
      return null;
    },
    Dialog: () => null,
    H1: Passthrough,
    Paragraph: Passthrough,
    Separator: () => <hr />,
    XStack: Passthrough,
    YStack: Passthrough,
  };
});

jest.mock('@legacy-sports/shared-components/auth', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    getStoredTokenExpiry: () => null,
  })),
  useAuth: () => ({
    config: {},
    user: {
      id: 1,
      username: 'casey',
      email: 'casey@example.com',
      picture: null,
      accessLevel: 'none',
    },
  }),
  useMfa: () => ({}),
}));

jest.mock('@legacy-sports/shared-components/icons', () => ({
  BrandIcon: () => null,
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  styled: <T,>(Component: T) => Component,
  Input: () => <input />,
  ScrollView: ({ children }: ChildrenProps) => <div>{children}</div>,
  Spinner: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: () => ({ data: undefined, refetch: mockRefetchUser }),
  useMyIdentitiesQuery: () => ({
    data: undefined,
    loading: false,
    refetch: jest.fn(),
  }),
  useSetCanonicalEmailMutation: () => [jest.fn(), { loading: false }],
  useUpdateUserAvatarMutation: () => [
    mockUpdateUserAvatar,
    { loading: mockAvatarLoading },
  ],
  useUpdateUsernameMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('../../components/profile/TwoFactorSection', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('../../components/layout/SuccessToast', () => ({
  showToast: (message: string) => {
    mockShowToast(message);
  },
}));

describe('ProfileSettingsPage avatar save (LS-7236)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAvatarLoading = false;
    mockPickerProps = undefined;
  });

  it('shows a success toast after a preset save, even once unmounted', async () => {
    let resolveSave: (value: { error?: Error }) => void = () => undefined;
    mockUpdateUserAvatar.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { unmount } = render(<ProfileSettingsPage />);

    act(() => mockPickerProps?.onSelect('/avatars/fox.png'));
    unmount();
    await act(async () => {
      resolveSave({});
      await Promise.resolve();
    });

    expect(mockShowToast).toHaveBeenCalledWith('Avatar updated');
  });

  it('does not toast when the save returns errors', async () => {
    mockUpdateUserAvatar.mockResolvedValue({ error: new Error('nope') });
    render(<ProfileSettingsPage />);

    await act(async () => {
      mockPickerProps?.onSelect('/avatars/fox.png');
      await Promise.resolve();
    });

    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('confirms before an in-app link click while the avatar save is pending', () => {
    mockAvatarLoading = true;
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <>
        <a href="/leagues">Leagues</a>
        <ProfileSettingsPage />
      </>,
    );

    fireEvent.click(screen.getByText('Leagues'));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Your avatar is still saving. Leave anyway?',
    );
    confirmSpy.mockRestore();
  });

  it('does not intercept navigation when no avatar save is pending', () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    render(
      <>
        <a href="/leagues">Leagues</a>
        <ProfileSettingsPage />
      </>,
    );

    fireEvent.click(screen.getByText('Leagues'));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

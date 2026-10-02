/**
 * Regression tests for LS-7232: the profile-card avatar `<img>` must NOT set
 * `crossOrigin`. `crossOrigin="anonymous"` forces a CORS-mode fetch, and some
 * lh3.googleusercontent.com variants don't answer it with CORS headers, so the
 * load fails, `onError` fires and the initial-letter fallback shows even though
 * the photo URL is valid. `referrerPolicy="no-referrer"` must stay.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfileSettingsPage from './ProfileSettingsPage';

type ChildrenProps = { children?: React.ReactNode };

const GOOGLE_PHOTO = 'https://lh3.googleusercontent.com/a/photo=s96-c';

type AuthMock = {
  config: Record<string, never>;
  user: {
    id: number;
    username: string;
    email: string;
    picture: string | null;
    accessLevel: string;
  };
};

const mockUseAuth = jest.fn<AuthMock, []>();
// Prefixed `mock` so jest's hoisted factory below may close over it.
let mockUsernameLoading = false;

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

jest.mock('@legacy-sports/shared-components/ui', () => {
  const Passthrough = ({ children }: ChildrenProps) => <div>{children}</div>;
  return {
    AvatarPicker: () => null,
    Dialog: ({
      open,
      title,
      confirmLabel,
      cancelLabel,
      onConfirm,
      onCancel,
    }: {
      open?: boolean;
      title: string;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm?: () => void;
      onCancel?: () => void;
    }) =>
      open ? (
        <div role="dialog" aria-label={title}>
          <button onClick={onCancel}>{cancelLabel}</button>
          <button onClick={onConfirm}>{confirmLabel}</button>
        </div>
      ) : null,
    H1: Passthrough,
    Paragraph: Passthrough,
    Separator: () => <hr />,
    XStack: Passthrough,
    YStack: ({
      children,
      onPress,
    }: ChildrenProps & { onPress?: () => void }) => (
      <div onClick={onPress}>{children}</div>
    ),
  };
});

const mockSignOut = jest.fn();
jest.mock('./signOut', () => ({
  signOut: (...args: unknown[]): unknown => mockSignOut(...args),
}));

jest.mock('../../utils/analytics', () => ({
  trackSignOut: jest.fn(),
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    getStoredTokenExpiry: () => null,
  })),
  useAuth: () => mockUseAuth(),
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
  useGetUserByIdQuery: () => ({ data: undefined, refetch: jest.fn() }),
  useMyIdentitiesQuery: () => ({
    data: undefined,
    loading: false,
    refetch: jest.fn(),
  }),
  useSetCanonicalEmailMutation: () => [jest.fn(), { loading: false }],
  useUpdateUserAvatarMutation: () => [jest.fn(), { loading: false }],
  useUpdateUsernameMutation: () => [
    jest.fn(),
    { loading: mockUsernameLoading },
  ],
}));

jest.mock('../../components/profile/TwoFactorSection', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

function renderPage(picture: string | null) {
  mockUseAuth.mockReturnValue({
    config: {},
    user: {
      id: 1,
      username: 'casey',
      email: 'casey@example.com',
      picture,
      accessLevel: 'user',
    },
  });
  return render(<ProfileSettingsPage />);
}

describe('ProfileSettingsPage avatar (LS-7232)', () => {
  it('renders the profile photo without a crossOrigin attribute', () => {
    renderPage(GOOGLE_PHOTO);

    const img = screen.getByAltText('casey');
    expect(img).toHaveAttribute('src', GOOGLE_PHOTO);
    expect(img).not.toHaveAttribute('crossorigin');
  });

  it('keeps referrerPolicy="no-referrer" on the profile photo', () => {
    renderPage(GOOGLE_PHOTO);

    expect(screen.getByAltText('casey')).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    );
  });

  it('still falls back to the initial letter when the image errors', () => {
    renderPage(GOOGLE_PHOTO);

    fireEvent.error(screen.getByAltText('casey'));

    expect(screen.queryByAltText('casey')).not.toBeInTheDocument();
    expect(screen.getAllByText('C').length).toBeGreaterThan(0);
  });
});

describe('ProfileSettingsPage username save in flight (LS-7237)', () => {
  afterEach(() => {
    mockUsernameLoading = false;
  });

  function fireBeforeUnload() {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  it('blocks tab close while the username save is in flight', () => {
    mockUsernameLoading = true;
    renderPage(null);

    expect(fireBeforeUnload().defaultPrevented).toBe(true);
  });

  it('does not block tab close when no username save is pending', () => {
    renderPage(null);

    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it('stops blocking tab close once the save settles', () => {
    mockUsernameLoading = true;
    const { rerender } = renderPage(null);
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    mockUsernameLoading = false;
    rerender(<ProfileSettingsPage />);

    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});

describe('ProfileSettingsPage sign-out confirmation (LS-7221)', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
  });

  it('asks for confirmation instead of signing out immediately', () => {
    renderPage(null);

    fireEvent.click(screen.getByText('Sign Out'));

    expect(screen.getByRole('dialog', { name: 'Sign out?' })).toBeVisible();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('signs out once the user confirms', () => {
    renderPage(null);

    fireEvent.click(screen.getByText('Sign Out'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays signed in when the user cancels', () => {
    renderPage(null);

    fireEvent.click(screen.getByText('Sign Out'));
    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

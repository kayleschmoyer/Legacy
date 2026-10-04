import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthPendingFallback } from './AuthPendingFallback';

const mockUseAuth = jest.fn<{ isLoading: boolean }, []>();

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  UnifiedLoadingPanel: () => <div data-testid="loading-panel" />,
}));

jest.mock('../../pages/login/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page" />,
}));

describe('AuthPendingFallback (LS-10457)', () => {
  it('shows the loading panel while auth is resolving', () => {
    mockUseAuth.mockReturnValue({ isLoading: true });
    render(<AuthPendingFallback />);
    expect(screen.getByTestId('loading-panel')).toBeTruthy();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('renders the login screen in place once auth resolves signed out', () => {
    mockUseAuth.mockReturnValue({ isLoading: false });
    render(<AuthPendingFallback />);
    expect(screen.getByTestId('login-page')).toBeTruthy();
    expect(screen.queryByTestId('loading-panel')).toBeNull();
  });
});

import React, { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AboutPage from './AboutPage';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress?: () => void;
  }) => <button onClick={onPress}>{children}</button>,
  H1: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
  H2: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  XStack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  YStack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('tamagui', () => ({
  styled:
    () =>
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../config/environment', () => ({
  env: { appVersion: '1.0.0', commitSha: 'abc123', buildDate: '2026-01-01' },
}));

jest.mock('../../constants/colors', () => ({ BRAND_GOLD_LIGHT: '#c5a55a' }));

const mockUseIsPremium = jest.fn<boolean, []>();
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: (): boolean => mockUseIsPremium(),
}));

describe('AboutPage — Get Started Free button (LS-5723)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to /pricing when non-premium user clicks Get Started Free', () => {
    mockUseIsPremium.mockReturnValue(false);
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Get Started Free'));

    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('does not render the Get Started Free button for premium users', () => {
    mockUseIsPremium.mockReturnValue(true);
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Get Started Free')).not.toBeInTheDocument();
  });
});

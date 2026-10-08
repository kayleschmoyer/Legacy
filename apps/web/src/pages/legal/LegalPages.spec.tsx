import React from 'react';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SUPPORT_EMAIL } from '@legacy-sports/utils';
import PrivacyPolicyPage from './PrivacyPolicyPage';
import TermsOfServicePage from './TermsOfServicePage';

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../consent/ConsentManager', () => ({
  CookieSettingsButton: () => null,
}));

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: 'dark' }),
}));

jest.mock('../../constants/colors', () => ({ BRAND_GOLD: '#c5a55a' }));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({
    children,
    onPress,
  }: ComponentProps<'button'> & { onPress?: () => void }) => (
    <button onClick={onPress}>{children}</button>
  ),
  H1: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
  H2: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  Paragraph: ({ children }: { children?: React.ReactNode }) => (
    <p>{children}</p>
  ),
  YStack: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('tamagui', () => ({
  styled:
    (Base: React.ComponentType<{ children?: React.ReactNode }>) =>
    ({ children }: { children?: React.ReactNode }) => <Base>{children}</Base>,
  Text: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

const PAGES = [
  { path: '/terms', Page: TermsOfServicePage },
  { path: '/privacy', Page: PrivacyPolicyPage },
];

describe.each(PAGES)('$path "← Back" (LS-10768)', ({ path, Page }) => {
  function renderPage(initialEntries: string[]) {
    return render(
      <MemoryRouter
        initialEntries={initialEntries}
        initialIndex={initialEntries.length - 1}
      >
        <CurrentPath />
        <Routes>
          <Route path={path} element={<Page />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('lands on / when opened directly in a fresh tab', () => {
    renderPage([path]);
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  it('returns to the previous in-app page', () => {
    renderPage(['/leagues', path]);
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/leagues$/);
  });
});

describe.each(PAGES)('$path contact + date (LS-10775)', ({ Page }) => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
  }

  it('links the approved support email', () => {
    renderPage();
    expect(screen.getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${SUPPORT_EMAIL}`,
    );
  });

  it('no longer shows the stale January 1, 2025 date', () => {
    renderPage();
    expect(screen.getByText(/Last updated:/)).toHaveTextContent(
      'Last updated: October 8, 2026',
    );
  });
});

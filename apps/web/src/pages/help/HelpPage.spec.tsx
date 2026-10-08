/**
 * LS-10746 regression: /help sits on the themed `$background`, but its text
 * used fixed dark-theme colours (WHITE, TEXT_FG2, TEXT_INTERFACE, …), so in
 * light theme the H1, intro, section headings, FAQ rows and footer were
 * near-white on white. Light must read theme tokens; dark must keep its
 * original values.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HELP_FAQ_ITEMS } from '@legacy-sports/utils';

import HelpPage from './HelpPage';
import {
  BRAND_GOLD_LIGHT,
  TEXT_FG2,
  TEXT_INTERFACE,
  TEXT_TERTIARY,
  WHITE,
} from '../../constants/colors';

let mockResolvedTheme: 'light' | 'dark' = 'light';

jest.mock('../../context/ThemeContext', () => ({
  useThemeContext: () => ({ resolvedTheme: mockResolvedTheme }),
}));

// Layout primitives render as plain passthroughs — the colours under test
// live on raw DOM text elements (h1/h2/p/span/button), not on Tamagui props.
jest.mock('tamagui', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return { styled: () => Pass, ScrollView: Pass, useMedia: () => ({}) };
});

jest.mock('@legacy-sports/shared-components/ui', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return { Button: Pass, XStack: Pass, YStack: Pass, OnboardingTutorial: Pass };
});

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../components/layout/BugReportButton', () => ({
  BugReportButton: () => null,
}));

jest.mock('../../utils/onboardingTutorialWeb', () => ({
  onboardingTutorialAnalytics: {},
  renderOnboardingLink: () => null,
}));

function renderPage(theme: 'light' | 'dark') {
  mockResolvedTheme = theme;
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );
}

const colorOf = (el: HTMLElement) => el.style.color;
const footerOf = () => screen.getByText(/© \d{4} Legacy Sports/);
const introOf = () => screen.getByText(/the answers are here/);
const firstFaq = HELP_FAQ_ITEMS[0].question;

describe('HelpPage theme colours (LS-10746)', () => {
  it('reads theme tokens for page-level text in light theme', () => {
    renderPage('light');

    expect(
      colorOf(
        screen.getByRole('heading', { level: 1, name: 'Help & Support' }),
      ),
    ).toBe('var(--color12)');
    expect(colorOf(introOf())).toBe('var(--color11)');
    expect(colorOf(screen.getByRole('heading', { name: 'Jump back in' }))).toBe(
      'var(--color12)',
    );
    expect(
      colorOf(
        screen.getByRole('heading', { name: 'Frequently asked questions' }),
      ),
    ).toBe('var(--color12)');
    expect(colorOf(screen.getByText('The Clubhouse'))).toBe('var(--goldText)');
    expect(colorOf(footerOf())).toBe('var(--color11)');
    expect(colorOf(screen.getByText(/Powered by official MLB/))).toBe(
      'var(--fg4)',
    );

    const question = screen.getByText(firstFaq);
    expect(colorOf(question)).toBe('var(--color12)');
    fireEvent.click(question);
    expect(colorOf(screen.getByText(firstFaq))).toBe('var(--goldText)');
    expect(colorOf(screen.getByText(HELP_FAQ_ITEMS[0].answer))).toBe(
      'var(--color11)',
    );
  });

  it('keeps the original dark-theme colours', () => {
    renderPage('dark');
    const hex = (c: string) => {
      const probe = document.createElement('span');
      probe.style.color = c;
      return probe.style.color;
    };

    expect(
      colorOf(
        screen.getByRole('heading', { level: 1, name: 'Help & Support' }),
      ),
    ).toBe(hex(WHITE));
    expect(colorOf(introOf())).toBe(hex(TEXT_FG2));
    expect(colorOf(screen.getByRole('heading', { name: 'Jump back in' }))).toBe(
      hex(TEXT_INTERFACE),
    );
    expect(colorOf(screen.getByText('The Clubhouse'))).toBe(
      hex(BRAND_GOLD_LIGHT),
    );
    expect(colorOf(footerOf())).toBe(hex(TEXT_FG2));
    expect(colorOf(screen.getByText(/Powered by official MLB/))).toBe(
      hex(TEXT_TERTIARY),
    );
    expect(colorOf(screen.getByText(firstFaq))).toBe(hex(TEXT_INTERFACE));
  });

  it('keeps the tutorial hero as a dark accent card in light theme', () => {
    renderPage('light');

    expect(
      colorOf(screen.getByRole('heading', { name: 'Take the clubhouse tour' })),
    ).toBe('rgb(255, 255, 255)');
  });
});

/**
 * LS-10425: the ticker must only duplicate/animate its chips when one copy
 * overflows the strip. With few games, both marquee copies were visible at
 * once (A·B·C A·B·C), reading as a duplicated ticker.
 *
 * Tamagui primitives are mocked as plain DOM elements (this Jest setup has no
 * TamaguiProvider). jsdom has no layout, so content/viewport widths and
 * ResizeObserver are stubbed per test.
 */
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';

import { ScoreboardTicker } from './ScoreboardTicker';

type DomProps = {
  children?: React.ReactNode;
  role?: string;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  'aria-label'?: string;
  'aria-hidden'?: string | boolean;
  'data-testid'?: string;
};

jest.mock('tamagui', () => {
  const ReactActual: typeof React = jest.requireActual('react');
  const dom =
    (tag: string) =>
    ({ children, ...rest }: DomProps) =>
      ReactActual.createElement(
        tag,
        {
          role: rest.role,
          className: rest.className,
          onMouseEnter: rest.onMouseEnter,
          onMouseLeave: rest.onMouseLeave,
          'aria-label': rest['aria-label'],
          'aria-hidden': rest['aria-hidden'],
          'data-testid': rest['data-testid'],
        },
        children,
      );
  return {
    styled: () => dom('div'),
    Text: dom('span'),
    XStack: dom('div'),
  };
});

jest.mock('react-router-dom', () => ({
  Link: ({
    children,
    to,
    tabIndex,
    'aria-label': ariaLabel,
  }: {
    children?: React.ReactNode;
    to: string;
    tabIndex?: number;
    'aria-label'?: string;
  }) => (
    <a href={to} tabIndex={tabIndex} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

const mockGames = [
  {
    gamePk: 1,
    status: 'Final',
    homeTeam: { abbreviation: 'NYY', runs: 3 },
    awayTeam: { abbreviation: 'BOS', runs: 2 },
  },
  {
    gamePk: 2,
    status: 'Final',
    homeTeam: { abbreviation: 'CHC', runs: 1 },
    awayTeam: { abbreviation: 'STL', runs: 4 },
  },
  {
    gamePk: 3,
    status: 'Final',
    homeTeam: { abbreviation: 'LAD', runs: 5 },
    awayTeam: { abbreviation: 'SF', runs: 0 },
  },
];

// Overridable per test; reset to the all-Final slate in beforeEach.
let mockScoreboardGames: Array<Record<string, unknown>> = mockGames;

jest.mock('@legacy-sports/graphql', () => ({
  useGetScoreboardQuery: () => ({
    data: { scoreboard: { games: mockScoreboardGames } },
    startPolling: jest.fn(),
    stopPolling: jest.fn(),
    refetch: jest.fn(),
  }),
}));

// ─── Layout stubs ─────────────────────────────────────────────────────────────

let contentWidth = 0;
let viewportWidth = 0;
let resizeCallbacks: Array<() => void> = [];

class MockResizeObserver {
  private readonly cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
    resizeCallbacks.push(cb);
  }
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect() {
    resizeCallbacks = resizeCallbacks.filter((c) => c !== this.cb);
  }
}

const originalScrollWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollWidth',
);
const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth',
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => contentWidth,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => viewportWidth,
  });
});

afterAll(() => {
  if (originalScrollWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollWidth',
      originalScrollWidth,
    );
  }
  if (originalClientWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      'clientWidth',
      originalClientWidth,
    );
  }
});

beforeEach(() => {
  mockScoreboardGames = mockGames;
  resizeCallbacks = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    MockResizeObserver;
});

afterEach(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

function chipLinks() {
  return within(screen.getByTestId('scoreboard-ticker')).queryAllByRole(
    'link',
    { hidden: true },
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScoreboardTicker overflow-only marquee (LS-10425)', () => {
  it('renders each game once, static, when the chips fit the strip', () => {
    contentWidth = 300;
    viewportWidth = 400;

    render(<ScoreboardTicker />);

    expect(chipLinks()).toHaveLength(mockGames.length);
    const track = screen.getByTestId('scoreboard-ticker-track');
    expect(track).toHaveAttribute('data-marquee', 'false');
    expect(track.style.animation).toBe('');
  });

  it('duplicates and animates the chips, with a separator between copies, when they overflow', () => {
    contentWidth = 600;
    viewportWidth = 400;

    render(<ScoreboardTicker />);

    expect(chipLinks()).toHaveLength(mockGames.length * 2);
    const track = screen.getByTestId('scoreboard-ticker-track');
    expect(track).toHaveAttribute('data-marquee', 'true');
    expect(track.style.animation).toContain('ticker-scroll');
    // Separators: (n-1) inside each copy + one trailing each copy, so both
    // halves of the translateX(-50%) loop are the same width.
    const separators = within(track)
      .getAllByText('·')
      .filter((el) => el.tagName === 'SPAN');
    expect(separators).toHaveLength(mockGames.length * 2);
    // Only the accessible copy is announced.
    expect(within(track).getAllByRole('link')).toHaveLength(mockGames.length);
  });

  it('switches modes when a resize changes whether the chips fit', () => {
    contentWidth = 300;
    viewportWidth = 400;

    render(<ScoreboardTicker />);
    expect(chipLinks()).toHaveLength(mockGames.length);

    viewportWidth = 200;
    act(() => resizeCallbacks.forEach((cb) => cb()));
    expect(chipLinks()).toHaveLength(mockGames.length * 2);

    viewportWidth = 800;
    act(() => resizeCallbacks.forEach((cb) => cb()));
    expect(chipLinks()).toHaveLength(mockGames.length);
    expect(screen.getByTestId('scoreboard-ticker-track')).toHaveAttribute(
      'data-marquee',
      'false',
    );
  });
});

describe('ScoreboardTicker hidden marquee copy is not focusable (LS-10783)', () => {
  it('removes every link in the aria-hidden duplicate from the tab order', () => {
    contentWidth = 600;
    viewportWidth = 400;

    render(<ScoreboardTicker />);

    const track = screen.getByTestId('scoreboard-ticker-track');
    const hiddenCopy = track.querySelector(':scope > [aria-hidden="true"]');
    expect(hiddenCopy).not.toBeNull();
    const hiddenLinks = hiddenCopy?.querySelectorAll('a') ?? [];
    expect(hiddenLinks).toHaveLength(mockGames.length);
    hiddenLinks.forEach((link) =>
      expect(link).toHaveAttribute('tabindex', '-1'),
    );
  });

  it('keeps each game reachable by keyboard exactly once while the marquee runs', () => {
    contentWidth = 600;
    viewportWidth = 400;

    render(<ScoreboardTicker />);

    const tabbable = chipLinks().filter(
      (link) => link.getAttribute('tabindex') !== '-1',
    );
    expect(tabbable.map((link) => link.getAttribute('aria-label'))).toEqual(
      mockGames.map(
        (g) =>
          `${g.awayTeam.abbreviation} ${g.awayTeam.runs}, ${g.homeTeam.abbreviation} ${g.homeTeam.runs} — FINAL`,
      ),
    );
  });
});

describe('ScoreboardTicker preview chip label and time (LS-10651)', () => {
  const startTime = '2026-10-06T22:00:00Z';
  const previewGame = {
    gamePk: 9,
    status: 'Preview',
    startTime,
    homeTeam: { abbreviation: 'ATL', runs: 0 },
    awayTeam: { abbreviation: 'LAD', runs: 0 },
  };

  it('uses the visible "vs" connector in the accessible name', () => {
    mockScoreboardGames = [previewGame];
    contentWidth = 300;
    viewportWidth = 400;

    render(<ScoreboardTicker />);

    const [link] = chipLinks();
    const visibleConnector = within(link).getByText('vs').textContent ?? '';
    expect(link.getAttribute('aria-label')).toContain(
      `LAD ${visibleConnector} ATL`,
    );
  });

  it('labels the start time with a time zone abbreviation', () => {
    mockScoreboardGames = [previewGame];
    contentWidth = 300;
    viewportWidth = 400;

    render(<ScoreboardTicker />);

    const expected = new Date(startTime).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    expect(
      new Date(startTime).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      }),
    ).not.toBe(expected);
    const [link] = chipLinks();
    expect(within(link).getByText(expected)).toBeTruthy();
    expect(link.getAttribute('aria-label')).toBe(`LAD vs ATL, ${expected}`);
  });
});

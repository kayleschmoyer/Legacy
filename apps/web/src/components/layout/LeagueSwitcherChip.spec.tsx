/**
 * Regression guard for LS-9127: clicking "Create a new league" in the header
 * League Switcher while the "Football" sport tab is selected sent the user to
 * the baseball league-creation page instead of football's, because the
 * create-league button hardcoded `/baseball/league/create` regardless of the
 * dropdown's selected sport.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { LeagueSwitcherChip } from './LeagueSwitcherChip';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const mockLeaguesFixture = [
  { id: 1, name: 'Baseball League', playerPool: 'baseball' },
  { id: 2, name: 'Football League', playerPool: 'football' },
];

let mockUserLeagues: unknown[] = [];

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserLeaguesQuery: () => ({ data: { userLeagues: mockUserLeagues } }),
}));

const renderChip = () =>
  render(
    <MemoryRouter>
      <LeagueSwitcherChip />
    </MemoryRouter>,
  );

describe('LeagueSwitcherChip — LS-9127 create-league sport routing', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUserLeagues = [];
  });

  it('navigates to the baseball create-league route by default', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Create a new league'));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/create');
  });

  it('navigates to the football create-league route after selecting the Football tab', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Football'));
    fireEvent.click(screen.getByText('Create a new league'));
    expect(mockNavigate).toHaveBeenCalledWith('/football/league/create');
  });
});

describe('LeagueSwitcherChip — LS-9127 existing-league and find-a-league sport routing', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUserLeagues = mockLeaguesFixture;
  });

  it('navigates to the selected football league when the Football tab is active', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Football'));
    fireEvent.click(screen.getByRole('option', { name: /Football League/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/football/league/2');
  });

  it('navigates to the selected baseball league when the Baseball tab is active', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByRole('option', { name: /Baseball League/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/1');
  });

  it('routes "Browse public leagues" and "Join with invite code" using the selected sport', () => {
    renderChip();
    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Football'));
    fireEvent.click(screen.getByText('Browse public leagues'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/football/leagues');

    fireEvent.click(screen.getByTestId('league-switcher-chip'));
    fireEvent.click(screen.getByText('Join with invite code'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/football/league/join');
  });
});

/**
 * Regression guard for LS-10754: on phones the dropdown was a fixed 340px-wide
 * panel anchored to the chip's left edge (~64px in), so it ran past a 375px
 * viewport's right edge; in landscape it ran under the fixed MobileBottomBar
 * with no way to scroll. The panel must narrow/shift to stay inside the
 * viewport and cap its height above the bottom bar, scrolling internally.
 */
describe('LeagueSwitcherChip — LS-10754 panel fits the viewport', () => {
  const rect = (r: Partial<DOMRect>): DOMRect => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...r,
  });

  // Mobile header chip: 16px padding + 36px hamburger + 12px gap = 64px in.
  const CHIP_RECT = rect({ left: 64, right: 284, top: 13, bottom: 57 });

  let rectSpy: jest.SpyInstance;
  let clientWidthSpy: jest.SpyInstance;

  const setViewport = (width: number, height: number) => {
    clientWidthSpy.mockReturnValue(width);
    window.innerHeight = height;
  };

  const renderWithBottomBar = (barTop: number | null) => {
    rectSpy.mockImplementation(function (this: Element) {
      if (this.getAttribute('aria-label') === 'Bottom navigation') {
        return barTop === null
          ? rect({})
          : rect({ top: barTop, bottom: barTop + 87, height: 87 });
      }
      return CHIP_RECT;
    });
    return render(
      <MemoryRouter>
        <LeagueSwitcherChip />
        <div role="navigation" aria-label="Bottom navigation" />
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    mockUserLeagues = mockLeaguesFixture;
    rectSpy = jest.spyOn(Element.prototype, 'getBoundingClientRect');
    clientWidthSpy = jest.spyOn(document.documentElement, 'clientWidth', 'get');
  });

  afterEach(() => {
    rectSpy.mockRestore();
    clientWidthSpy.mockRestore();
  });

  it('keeps the panel inside a 375px-wide portrait viewport', () => {
    setViewport(375, 667);
    renderWithBottomBar(580);
    fireEvent.click(screen.getByTestId('league-switcher-chip'));

    const panel = screen.getByRole('listbox', { name: 'League selector' });
    const width = parseFloat(panel.style.width);
    const viewportLeft = CHIP_RECT.left + parseFloat(panel.style.left);
    expect(viewportLeft).toBeGreaterThanOrEqual(16);
    expect(viewportLeft + width).toBeLessThanOrEqual(375 - 16);
    expect(panel.style.boxSizing).toBe('border-box');
  });

  it('caps the panel height above the bottom bar and scrolls internally in landscape', () => {
    setViewport(667, 375);
    renderWithBottomBar(288);
    fireEvent.click(screen.getByTestId('league-switcher-chip'));

    const panel = screen.getByRole('listbox', { name: 'League selector' });
    // 288 (bar top) - 16 (gutter) - 57 (chip bottom) - 8 (offset) = 207
    expect(panel.style.maxHeight).toBe('207px');
    expect(panel.style.overflowY).toBe('auto');
    expect(panel.style.overscrollBehavior).toBe('contain');
    // Wide enough for the full panel: stays anchored to the chip.
    expect(panel.style.left).toBe('0px');
    expect(panel.style.width).toBe('340px');
  });

  it('caps the panel height at the viewport bottom when the bottom bar is hidden', () => {
    setViewport(1280, 720);
    renderWithBottomBar(null);
    fireEvent.click(screen.getByTestId('league-switcher-chip'));

    const panel = screen.getByRole('listbox', { name: 'League selector' });
    // 720 - 16 - 57 - 8 = 639
    expect(panel.style.maxHeight).toBe('639px');
    expect(panel.style.left).toBe('0px');
  });
});

describe('LeagueSwitcherChip — LS-10705 fluid chip in the mobile header', () => {
  beforeEach(() => {
    mockUserLeagues = mockLeaguesFixture;
  });

  it('lets the chip and its wrapper shrink when fluid', () => {
    render(
      <MemoryRouter>
        <LeagueSwitcherChip fluid />
      </MemoryRouter>,
    );
    const chip = screen.getByTestId('league-switcher-chip');
    expect(chip.style.flexShrink).toBe('1');
    expect(chip.style.minWidth).toBe('0');
    const wrapper = chip.parentElement as HTMLElement;
    expect(wrapper.style.flexShrink).toBe('1');
    expect(wrapper.style.minWidth).toBe('0');
  });

  it('keeps the fixed-width chip by default (desktop nav)', () => {
    renderChip();
    const chip = screen.getByTestId('league-switcher-chip');
    expect(chip.style.flexShrink).toBe('0');
    expect((chip.parentElement as HTMLElement).style.flexShrink).toBe('0');
  });
});

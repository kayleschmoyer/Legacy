import React from 'react';
import { act, fireEvent, within } from '@testing-library/react';
import { useMedia } from 'tamagui';
import {
  getDraftStatusChipDef,
  type HeroLeague,
  LeagueDetailShell,
  type LeagueDetailShellProps,
  type LeagueTabDef,
  tabStripOverflow,
} from './LeagueDetailShell';
import { render } from '../../test-utils';

// `useMedia` is already stubbed to `jest.fn(() => ({}))` by the package-wide
// `tamagui` mock in jest-setup-web.js — every breakpoint false (desktop) by
// default. Override per-test with `(useMedia as jest.Mock).mockReturnValue(...)`
// to simulate phone widths.

// `Settings` (commish tab) and `Roster` (member tab) are chosen for clarity.
const TABS: readonly LeagueTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'roster', label: 'Roster', memberOnly: true },
  { id: 'trades', label: 'Trades' },
  { id: 'commish', label: 'Settings', commishOnly: true },
];

const baseLeague: HeroLeague = {
  name: 'Dead Ball Dynasty',
  scoringLabel: 'Standard',
  draftStatus: 'completed',
  currentWeek: 14,
  totalMatchups: 22,
  teamCount: 12,
  inviteCode: 'ABC123',
};

function shellProps(
  overrides: Partial<LeagueDetailShellProps> = {},
): LeagueDetailShellProps {
  return {
    sport: 'baseball',
    league: baseLeague,
    role: 'commish',
    onRoleChange: jest.fn(),
    season: '2025',
    onSeasonChange: jest.fn(),
    seasons: [{ value: '2025', label: 'Season 2025 · Active' }],
    isCommissioner: true,
    isMember: true,
    tabs: TABS,
    activeTab: 'overview',
    onTabChange: jest.fn(),
    onBack: jest.fn(),
    onInvite: jest.fn(),
    ...overrides,
  };
}

function renderShell(overrides: Partial<LeagueDetailShellProps> = {}) {
  return render(<LeagueDetailShell {...shellProps(overrides)} />);
}

describe('LeagueDetailShell', () => {
  beforeEach(() => {
    // Default to a wide viewport (no breakpoint matches) unless a test opts in.
    (useMedia as jest.Mock).mockReturnValue({});
  });

  it('renders the league name in the hero', () => {
    const { getAllByText } = renderShell();
    expect(getAllByText('Dead Ball Dynasty').length).toBeGreaterThan(0);
  });

  it('maps a completed draft to "Season Active"', () => {
    const { getByText } = renderShell();
    expect(getByText('Season Active')).toBeTruthy();
  });

  // The `live` chip animates (Animated.Value), which the jsdom react-native
  // mock stubs out — so the in-progress/drafting mapping is asserted on the
  // pure helper rather than by rendering.
  it('maps draft statuses to the right chip tone + label', () => {
    expect(getDraftStatusChipDef('in-progress')).toEqual({
      tone: 'live',
      label: 'Drafting · Live',
    });
    expect(getDraftStatusChipDef('drafting')).toEqual({
      tone: 'live',
      label: 'Drafting · Live',
    });
    expect(getDraftStatusChipDef('queued')).toEqual({
      tone: 'soon',
      label: 'Draft Queued',
    });
    expect(getDraftStatusChipDef('not-started')).toEqual({
      tone: 'pre',
      label: 'Pre-Draft',
    });
    expect(getDraftStatusChipDef('completed')).toEqual({
      tone: 'active',
      label: 'Season Active',
    });
    expect(getDraftStatusChipDef(null)).toBeNull();
    expect(getDraftStatusChipDef('weird')).toEqual({
      tone: 'fin',
      label: 'weird',
    });
  });

  it('renders no draft chip when the status is absent', () => {
    const { queryByText } = renderShell({
      league: { ...baseLeague, draftStatus: null },
    });
    expect(queryByText('Season Active')).toBeNull();
    expect(queryByText('Drafting · Live')).toBeNull();
  });

  it('gates the commissioner-only tab when viewing as a member', () => {
    const { queryByText } = renderShell({ role: 'member' });
    expect(queryByText('Settings')).toBeNull();
  });

  it('hides member-only and commish-only tabs for a pure spectator', () => {
    const { queryByText } = renderShell({
      isCommissioner: false,
      isMember: false,
      role: 'spectator',
    });
    expect(queryByText('Roster')).toBeNull();
    expect(queryByText('Settings')).toBeNull();
  });

  // LS-7562: on a phone-width viewport the trailing commissioner tab scrolls
  // off-screen. It is hoisted next to the leading tab so commissioners can reach
  // it without horizontally scrolling the bar.
  it('hoists the commissioner tab next to Overview on a phone-width viewport', () => {
    (useMedia as jest.Mock).mockReturnValue({ xs: true });
    const { getByRole } = renderShell();
    const labels = within(getByRole('tablist', { name: 'League sections' }))
      .getAllByRole('tab')
      .map((el) => el.textContent);
    expect(labels[0]).toBe('Overview');
    expect(labels[1]).toBe('Settings');
  });

  it('keeps the commissioner tab in its canonical trailing slot on wide viewports', () => {
    (useMedia as jest.Mock).mockReturnValue({}); // desktop: no breakpoint matches
    const { getByRole } = renderShell();
    const labels = within(getByRole('tablist', { name: 'League sections' }))
      .getAllByRole('tab')
      .map((el) => el.textContent);
    expect(labels[labels.length - 1]).toBe('Settings');
  });

  it('does not reorder tabs for a non-commissioner on a phone-width viewport', () => {
    (useMedia as jest.Mock).mockReturnValue({ xs: true });
    const { getByRole, queryByText } = renderShell({
      role: 'member',
      isCommissioner: false,
    });
    expect(queryByText('Settings')).toBeNull();
    const labels = within(getByRole('tablist', { name: 'League sections' }))
      .getAllByRole('tab')
      .map((el) => el.textContent);
    expect(labels).toEqual(['Overview', 'Roster', 'Trades']);
  });

  // LS-7564: the native football league screen (apps/app/.../football/league/
  // [leagueId].tsx) composes its 8 tabs (9 with Waivers enabled) through this
  // exact shared shell, so the LS-7562 hoist fix applies with zero
  // football-specific code. These cases pin that contract against football's
  // actual tab shape — an extra memberOnly Chat tab and an optionally-spliced
  // Waivers tab — rather than relying solely on the generic 4-tab fixture
  // above, per LS-7564 AC5 ("confirm the football screen independently").
  describe('football tab layout (LS-7564)', () => {
    const FOOTBALL_TABS: readonly LeagueTabDef[] = [
      { id: 'overview', label: 'Overview' },
      { id: 'roster', label: 'Roster' },
      { id: 'free-agents', label: 'Free Agents' },
      { id: 'matchups', label: 'Matchups' },
      { id: 'trades', label: 'Trades' },
      { id: 'standings', label: 'Standings' },
      { id: 'chat', label: 'Chat', memberOnly: true },
      { id: 'commissioner', label: 'Settings', commishOnly: true },
    ];
    const FOOTBALL_TABS_WITH_WAIVERS: readonly LeagueTabDef[] = [
      ...FOOTBALL_TABS.slice(0, 5),
      { id: 'waivers', label: 'Waivers' },
      ...FOOTBALL_TABS.slice(5),
    ];

    it('hoists Settings next to Overview at phone width with football’s 8-tab layout', () => {
      (useMedia as jest.Mock).mockReturnValue({ xs: true });
      const { getByRole } = renderShell({
        sport: 'football',
        tabs: FOOTBALL_TABS,
      });
      const labels = within(getByRole('tablist', { name: 'League sections' }))
        .getAllByRole('tab')
        .map((el) => el.textContent);
      expect(labels[0]).toBe('Overview');
      expect(labels[1]).toBe('Settings');
    });

    it('hoists Settings next to Overview at phone width with Waivers enabled (9 tabs)', () => {
      (useMedia as jest.Mock).mockReturnValue({ xs: true });
      const { getByRole } = renderShell({
        sport: 'football',
        tabs: FOOTBALL_TABS_WITH_WAIVERS,
      });
      const labels = within(getByRole('tablist', { name: 'League sections' }))
        .getAllByRole('tab')
        .map((el) => el.textContent);
      expect(labels[0]).toBe('Overview');
      expect(labels[1]).toBe('Settings');
    });

    it('keeps Settings in its canonical trailing slot on wide viewports for football', () => {
      (useMedia as jest.Mock).mockReturnValue({});
      const { getByRole } = renderShell({
        sport: 'football',
        tabs: FOOTBALL_TABS,
      });
      const labels = within(getByRole('tablist', { name: 'League sections' }))
        .getAllByRole('tab')
        .map((el) => el.textContent);
      expect(labels[labels.length - 1]).toBe('Settings');
    });

    it('does not render Settings for a non-commissioner viewing the football tab layout', () => {
      (useMedia as jest.Mock).mockReturnValue({ xs: true });
      const { queryByText } = renderShell({
        sport: 'football',
        tabs: FOOTBALL_TABS,
        role: 'member',
        isCommissioner: false,
      });
      expect(queryByText('Settings')).toBeNull();
    });
  });

  it('fires onTabChange when a tab is pressed', () => {
    const onTabChange = jest.fn();
    const { getByText } = renderShell({ onTabChange });
    fireEvent.click(getByText('Trades'));
    expect(onTabChange).toHaveBeenCalledWith('trades');
  });

  // LS-10752: the tab bar uses a roving tabindex (only the selected tab is
  // tabIndex=0), so arrow/Home/End keys must move focus + selection, or every
  // other tab is unreachable by keyboard.
  describe('keyboard navigation (LS-10752)', () => {
    function getTab(
      getByRole: ReturnType<typeof renderShell>['getByRole'],
      name: string,
    ) {
      return getByRole('tab', { name });
    }

    it('keeps a single Tab stop: only the selected tab is tabbable', () => {
      const { getAllByRole } = renderShell({ activeTab: 'trades' });
      const tabbable = getAllByRole('tab').filter(
        (el) => el.getAttribute('tabindex') === '0',
      );
      expect(tabbable.map((el) => el.textContent)).toEqual(['Trades']);
    });

    it('ArrowRight focuses and selects the next tab', () => {
      const onTabChange = jest.fn();
      const { getByRole } = renderShell({ onTabChange });
      const overview = getTab(getByRole, 'Overview');
      overview.focus();
      fireEvent.keyDown(overview, { key: 'ArrowRight' });
      expect(onTabChange).toHaveBeenCalledWith('roster');
      expect(document.activeElement).toBe(getTab(getByRole, 'Roster'));
    });

    it('keeps moving from the focused tab before the selection re-renders', () => {
      const onTabChange = jest.fn();
      const { getByRole } = renderShell({ onTabChange });
      const overview = getTab(getByRole, 'Overview');
      overview.focus();
      fireEvent.keyDown(overview, { key: 'ArrowRight' });
      fireEvent.keyDown(document.activeElement as Element, {
        key: 'ArrowRight',
      });
      expect(onTabChange).toHaveBeenLastCalledWith('trades');
      expect(document.activeElement).toBe(getTab(getByRole, 'Trades'));
    });

    it('End selects the last tab and does not scroll the page', () => {
      const onTabChange = jest.fn();
      const { getByRole } = renderShell({ onTabChange });
      const overview = getTab(getByRole, 'Overview');
      overview.focus();
      // fireEvent returns false when the handler called preventDefault.
      expect(fireEvent.keyDown(overview, { key: 'End' })).toBe(false);
      expect(onTabChange).toHaveBeenCalledWith('commish');
      expect(document.activeElement).toBe(getTab(getByRole, 'Settings'));
    });

    it('Home returns to the first tab and does not scroll the page', () => {
      const onTabChange = jest.fn();
      const { getByRole } = renderShell({ onTabChange, activeTab: 'trades' });
      const trades = getTab(getByRole, 'Trades');
      trades.focus();
      expect(fireEvent.keyDown(trades, { key: 'Home' })).toBe(false);
      expect(onTabChange).toHaveBeenCalledWith('overview');
      expect(document.activeElement).toBe(getTab(getByRole, 'Overview'));
    });

    it('ArrowLeft from the first tab wraps to the last', () => {
      const onTabChange = jest.fn();
      const { getByRole } = renderShell({ onTabChange });
      const overview = getTab(getByRole, 'Overview');
      overview.focus();
      fireEvent.keyDown(overview, { key: 'ArrowLeft' });
      expect(onTabChange).toHaveBeenCalledWith('commish');
      expect(document.activeElement).toBe(getTab(getByRole, 'Settings'));
    });

    it('leaves Tab and other keys to the browser', () => {
      const onTabChange = jest.fn();
      const { getByRole } = renderShell({ onTabChange });
      const overview = getTab(getByRole, 'Overview');
      overview.focus();
      expect(fireEvent.keyDown(overview, { key: 'Tab' })).toBe(true);
      expect(fireEvent.keyDown(overview, { key: 'a' })).toBe(true);
      // Alt+ArrowLeft is the browser Back shortcut.
      expect(
        fireEvent.keyDown(overview, { key: 'ArrowLeft', altKey: true }),
      ).toBe(true);
      expect(onTabChange).not.toHaveBeenCalled();
    });
  });

  it('renders no back link in the hero (LS-8766)', () => {
    const { queryByText } = renderShell({});
    expect(queryByText('Leagues')).toBeNull();
  });

  it('fires onInvite from the hero invite action', () => {
    const onInvite = jest.fn();
    const { getByRole } = renderShell({ onInvite });
    fireEvent.click(getByRole('button', { name: 'Invite' }));
    expect(onInvite).toHaveBeenCalledTimes(1);
  });

  it('copies the invite code to the clipboard when the code is pressed', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { getByRole, findByText } = renderShell();
    fireEvent.click(
      getByRole('button', { name: 'Copy league invite code ABC123' }),
    );

    expect(writeText).toHaveBeenCalledWith('ABC123');
    // Confirmation feedback appears after the async clipboard write resolves.
    expect(await findByText('Copied')).toBeTruthy();
  });

  it('does not throw when the clipboard API is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined });

    const { getByRole, queryByText } = renderShell();
    expect(() =>
      fireEvent.click(
        getByRole('button', { name: 'Copy league invite code ABC123' }),
      ),
    ).not.toThrow();
    expect(queryByText('Copied')).toBeNull();
  });

  it('renders the pending-trade badge on the trades tab', () => {
    const { getByText } = renderShell({ pendingTradeCount: 3 });
    expect(getByText('3')).toBeTruthy();
  });

  it('renders an Analytics action when a handler is provided', () => {
    const onAnalytics = jest.fn();
    const { getByText } = renderShell({ onAnalytics });
    fireEvent.click(getByText('Analytics'));
    expect(onAnalytics).toHaveBeenCalledTimes(1);
  });

  // LS-9126: Analytics navigates to a separate premium-gated route, not a
  // same-page tab — it must not be marked up (or discoverable) as a tab, or
  // it silently misleads users and assistive tech into expecting in-page
  // content when activated.
  it('renders the Analytics action outside the tab list, not as a tab', () => {
    const onAnalytics = jest.fn();
    const { getByText, getByRole } = renderShell({ onAnalytics });
    const analyticsAction = getByText('Analytics');
    expect(within(getByRole('tablist')).queryByText('Analytics')).toBeNull();
    expect(analyticsAction.closest('[role="tab"]')).toBeNull();
    expect(analyticsAction.closest('[role="link"]')).not.toBeNull();
  });

  // LS-10722: on a phone (or desktop at 200% zoom) the tab strip scrolls. A
  // direct load of a middle tab must scroll it into view, and the strip must
  // show a fade on each side that hides tabs — none when everything fits.
  describe('tab strip overflow (LS-10722)', () => {
    const tamaguiMock = jest.requireMock<Record<string, unknown>>('tamagui');
    const realScrollView: unknown = tamaguiMock.ScrollView;
    let scrollProps: Record<string, (...args: never[]) => void>;
    let scrollTo: jest.Mock;
    let strip: { scrollLeft: number; clientWidth: number; scrollWidth: number };

    // Stand-in for the RN/Tamagui ScrollView: records its event props and
    // exposes the same imperative handle the real one has on web.
    const CapturingScrollView = React.forwardRef(function CapturingScrollView(
      {
        children,
        ...props
      }: { children?: React.ReactNode } & Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      scrollProps = props as typeof scrollProps;
      const nodeRef = React.useRef<HTMLDivElement | null>(null);
      React.useImperativeHandle(ref, () => ({
        scrollTo,
        getScrollableNode: () => nodeRef.current,
      }));
      return (
        <div
          data-testid="league-tabs-strip"
          ref={(el) => {
            nodeRef.current = el;
            if (el) {
              Object.defineProperties(el, {
                scrollLeft: { configurable: true, get: () => strip.scrollLeft },
                clientWidth: {
                  configurable: true,
                  get: () => strip.clientWidth,
                },
                scrollWidth: {
                  configurable: true,
                  get: () => strip.scrollWidth,
                },
              });
            }
          }}
        >
          {children}
        </div>
      );
    });

    // Tabs are 100px wide, laid out left to right from x=0 in DOM order.
    function mockTabRects() {
      jest
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: Element) {
          if (this.getAttribute('role') === 'tab') {
            const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
            const left = tabs.indexOf(this) * 100;
            return { left, right: left + 100, width: 100 } as DOMRect;
          }
          return { left: 0, right: 0, width: 0 } as DOMRect;
        });
    }

    beforeEach(() => {
      scrollTo = jest.fn();
      strip = { scrollLeft: 0, clientWidth: 375, scrollWidth: 400 };
      tamaguiMock.ScrollView = CapturingScrollView;
      mockTabRects();
    });

    afterEach(() => {
      tamaguiMock.ScrollView = realScrollView;
      jest.restoreAllMocks();
    });

    function setSizes(viewport: number, content: number) {
      act(() => {
        scrollProps.onLayout({
          nativeEvent: { layout: { width: viewport } },
        } as never);
        scrollProps.onContentSizeChange(content as never);
      });
    }

    function scrollStripTo(x: number, viewport: number, content: number) {
      act(() => {
        scrollProps.onScroll({
          nativeEvent: {
            contentOffset: { x },
            contentSize: { width: content },
            layoutMeasurement: { width: viewport },
          },
        } as never);
      });
    }

    it('scrolls an off-screen active tab into view on load, clear of the fade', () => {
      // Six tabs at 100px in a 250px strip: Tab F (500–600) is off-screen.
      const tabs: LeagueTabDef[] = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({
        id: l.toLowerCase(),
        label: `Tab ${l}`,
      }));
      strip = { scrollLeft: 0, clientWidth: 250, scrollWidth: 600 };
      renderShell({ tabs, activeTab: 'f' });
      // Least movement that shows 500–600 plus a 32px fade margin, clamped
      // to the 350px scroll range.
      expect(scrollTo).toHaveBeenCalledWith({ x: 350, y: 0, animated: false });
    });

    it('scrolls a middle tab just far enough to clear the right fade', () => {
      const tabs: LeagueTabDef[] = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({
        id: l.toLowerCase(),
        label: `Tab ${l}`,
      }));
      strip = { scrollLeft: 0, clientWidth: 250, scrollWidth: 600 };
      renderShell({ tabs, activeTab: 'c' });
      // Tab C is 200–300; with the fade margin it needs 168–332 visible.
      expect(scrollTo).toHaveBeenCalledWith({ x: 82, y: 0, animated: false });
    });

    it('re-reveals the active tab when the selection changes', () => {
      const tabs: LeagueTabDef[] = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => ({
        id: l.toLowerCase(),
        label: `Tab ${l}`,
      }));
      strip = { scrollLeft: 0, clientWidth: 250, scrollWidth: 600 };
      const { rerender } = renderShell({ tabs, activeTab: 'a' });
      expect(scrollTo).not.toHaveBeenCalled();
      rerender(<LeagueDetailShell {...shellProps({ tabs, activeTab: 'e' })} />);
      expect(scrollTo).toHaveBeenCalledWith({ x: 282, y: 0, animated: false });
    });

    it('does not scroll when the active tab is already visible', () => {
      renderShell({ activeTab: 'overview' });
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('shows no fade when every tab fits (desktop, 100% zoom)', () => {
      const { queryByTestId } = renderShell();
      setSizes(1232, 600);
      expect(queryByTestId('league-tabs-fade-start')).toBeNull();
      expect(queryByTestId('league-tabs-fade-end')).toBeNull();
    });

    it('shows only the trailing fade at the start of an overflowing strip', () => {
      const { queryByTestId } = renderShell();
      setSizes(327, 900);
      expect(queryByTestId('league-tabs-fade-start')).toBeNull();
      expect(queryByTestId('league-tabs-fade-end')).not.toBeNull();
    });

    it('shows both fades mid-scroll and only the leading fade at the end', () => {
      const { queryByTestId } = renderShell();
      scrollStripTo(200, 327, 900);
      expect(queryByTestId('league-tabs-fade-start')).not.toBeNull();
      expect(queryByTestId('league-tabs-fade-end')).not.toBeNull();
      scrollStripTo(573, 327, 900);
      expect(queryByTestId('league-tabs-fade-start')).not.toBeNull();
      expect(queryByTestId('league-tabs-fade-end')).toBeNull();
    });

    it('keeps the fades out of the tablist and the accessibility tree', () => {
      const { getByTestId, getByRole } = renderShell();
      scrollStripTo(200, 327, 900);
      const fade = getByTestId('league-tabs-fade-end');
      expect(fade.getAttribute('aria-hidden')).toBe('true');
      expect(getByRole('tablist').contains(fade)).toBe(false);
    });
  });

  describe('tabStripOverflow', () => {
    it.each([
      ['fits', { x: 0, viewport: 1000, content: 600 }, false, false],
      [
        'fits within 1px rounding',
        { x: 0, viewport: 600, content: 601 },
        false,
        false,
      ],
      ['not measured yet', { x: 0, viewport: 0, content: 900 }, false, false],
      [
        'overflowing, at start',
        { x: 0, viewport: 300, content: 900 },
        false,
        true,
      ],
      [
        'overflowing, mid-scroll',
        { x: 200, viewport: 300, content: 900 },
        true,
        true,
      ],
      [
        'overflowing, at end',
        { x: 600, viewport: 300, content: 900 },
        true,
        false,
      ],
    ])('%s', (_name, metrics, start, end) => {
      expect(tabStripOverflow(metrics)).toEqual({ start, end });
    });
  });

  // LS-8988: the League Home "Guided Home" redesign replaces the hero + tab
  // bar with its own compact header while on the Overview tab; every other
  // consumer (web, football, baseball's non-Overview tabs) must render
  // exactly as before since the prop defaults to false.
  describe('hideHeroAndTabs (LS-8988)', () => {
    it('renders the hero and tab bar by default', () => {
      const { getByText, getByRole } = renderShell();
      expect(getByText('Dead Ball Dynasty')).toBeTruthy();
      expect(getByRole('tablist', { name: 'League sections' })).toBeTruthy();
    });

    it('hides the hero and tab bar when true, still rendering children', () => {
      const { queryByText, queryByRole, getByText } = renderShell({
        hideHeroAndTabs: true,
        children: <div>Guided Home content</div>,
      });
      expect(queryByText('Dead Ball Dynasty')).toBeNull();
      expect(queryByRole('tablist', { name: 'League sections' })).toBeNull();
      expect(getByText('Guided Home content')).toBeTruthy();
    });
  });
});

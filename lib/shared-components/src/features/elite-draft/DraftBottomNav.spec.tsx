import React from 'react';
import {
  DRAFT_BOTTOM_NAV_ROW_HEIGHT,
  DraftBottomNav,
  draftBottomNavHeight,
} from './DraftBottomNav';
import { fireEvent, render, screen } from '../../test-utils';

describe('DraftBottomNav', () => {
  it('renders all 5 tabs', () => {
    render(<DraftBottomNav activeTab="board" onChangeTab={jest.fn()} />);

    expect(screen.getByText('Board')).toBeTruthy();
    expect(screen.getByText('Players')).toBeTruthy();
    expect(screen.getByText('Queue')).toBeTruthy();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });

  it('marks the active tab selected and the rest not selected', () => {
    render(<DraftBottomNav activeTab="queue" onChangeTab={jest.fn()} />);

    expect(screen.getByTestId('draft-bottom-nav-queue')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('draft-bottom-nav-board')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls onChangeTab with the tapped tab', () => {
    const onChangeTab = jest.fn();
    render(<DraftBottomNav activeTab="board" onChangeTab={onChangeTab} />);

    fireEvent.click(screen.getByTestId('draft-bottom-nav-team'));

    expect(onChangeTab).toHaveBeenCalledWith('team');
  });

  it('shows the unread-chat dot on the Chat tab icon when unreadChat is true', () => {
    render(
      <DraftBottomNav activeTab="board" onChangeTab={jest.fn()} unreadChat />,
    );

    expect(screen.getByTestId('draft-bottom-nav-chat-unread-dot')).toBeTruthy();
  });

  it('hides the unread-chat dot when unreadChat is false', () => {
    render(
      <DraftBottomNav
        activeTab="board"
        onChangeTab={jest.fn()}
        unreadChat={false}
      />,
    );

    expect(screen.queryByTestId('draft-bottom-nav-chat-unread-dot')).toBeNull();
  });

  it('still renders every tab when a safe-area inset is applied', () => {
    render(
      <DraftBottomNav
        activeTab="board"
        onChangeTab={jest.fn()}
        bottomInset={48}
      />,
    );

    expect(screen.getByTestId('draft-bottom-nav')).toBeTruthy();
    for (const label of ['Board', 'Players', 'Queue', 'Team', 'Chat']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

// LS-9444: the Draft Room is pushed outside the `(tabs)` shell, so nothing
// above it reserves Android's edge-to-edge navigation-bar inset the way React
// Navigation's tab bar does for the tab screens — the nav has to grow by the
// inset itself or the system nav buttons sit straight on top of the tab row.
// Asserted on the sizing helper rather than the rendered node because this
// suite's Tamagui mock strips layout props (`height`, `paddingBottom`) before
// they reach the DOM, so a `toHaveStyle` assertion here would pass vacuously.
describe('draftBottomNavHeight', () => {
  it('is the bare row height when there is no inset', () => {
    expect(draftBottomNavHeight()).toBe(DRAFT_BOTTOM_NAV_ROW_HEIGHT);
    expect(draftBottomNavHeight(0)).toBe(56);
  });

  it('grows by the inset so the tab row clears the system navigation bar', () => {
    expect(draftBottomNavHeight(48)).toBe(104);
    expect(draftBottomNavHeight(24)).toBe(80);
  });

  it('ignores a negative inset rather than shrinking the row', () => {
    expect(draftBottomNavHeight(-10)).toBe(DRAFT_BOTTOM_NAV_ROW_HEIGHT);
  });
});

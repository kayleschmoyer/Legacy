/**
 * useDraftUIState — Draft Room v2 shell additive extension (LS-9397).
 *
 * The Draft Room v2 shell (header band, ticker, bottom nav) needs new shared
 * UI state — active tab, selected team, unread-chat flag, and toast/splash
 * queues — but this hook has other call sites (spectator screen, auction
 * room, and LS-8790's native draft screen if it shares the hook) that must
 * be unaffected. Every case below exercises a pre-existing field/setter
 * exactly as those call sites already use it, alongside the new fields, to
 * prove the extension is additive rather than a behavioral change.
 */
import { act, renderHook } from '@testing-library/react';
import { useDraftUIState } from './useDraftUIState';
import type { DraftPlayer } from '../types';

const player: DraftPlayer = {
  id: 1,
  name: 'Bobby Witt Jr.',
  position: 'SS',
  avg: 0.332,
  hr: 32,
  rbi: 96,
  runs: 100,
  sb: 30,
  games: 160,
  hits: 200,
  obp: 0.389,
  slg: 0.588,
};

describe('useDraftUIState — pre-existing call sites unchanged', () => {
  it('keeps selectedPosition/searchTerm/watchlist/chatOpen behavior intact', () => {
    const { result } = renderHook(() => useDraftUIState());

    expect(result.current.selectedPosition).toBe('ALL');
    expect(result.current.searchTerm).toBe('');
    expect(result.current.watchlist).toEqual([]);
    expect(result.current.chatOpen).toBe(false);

    act(() => {
      result.current.setSelectedPosition('SS');
      result.current.setSearchTerm('witt');
      result.current.setWatchlist([1, 2]);
      result.current.setChatOpen(true);
    });

    expect(result.current.selectedPosition).toBe('SS');
    expect(result.current.searchTerm).toBe('witt');
    expect(result.current.watchlist).toEqual([1, 2]);
    expect(result.current.chatOpen).toBe(true);
  });

  it('keeps the announcement lifecycle (showAnnouncement/dismissAnnouncement) intact', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useDraftUIState());

    act(() => {
      result.current.showAnnouncement(player, 3, 1, 3, true, false, 'My Team');
    });

    expect(result.current.announcement).toMatchObject({
      pickNumber: 3,
      isMyPick: true,
    });

    act(() => {
      result.current.dismissAnnouncement();
      jest.advanceTimersByTime(400);
    });

    expect(result.current.announcement).toBeNull();
    jest.useRealTimers();
  });

  it('keeps toastMessage auto-dismiss intact', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useDraftUIState());

    act(() => {
      result.current.showToast('Draft pick failed', 'error');
    });

    expect(result.current.toastMessage).toEqual({
      text: 'Draft pick failed',
      type: 'error',
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.toastMessage).toBeNull();
    jest.useRealTimers();
  });
});

describe('useDraftUIState — Draft Room v2 shell additions (LS-9397)', () => {
  it('defaults activeTab to board, selectedTeamId to null, and unreadChat to false', () => {
    const { result } = renderHook(() => useDraftUIState());

    expect(result.current.activeTab).toBe('board');
    expect(result.current.selectedTeamId).toBeNull();
    expect(result.current.unreadChat).toBe(false);
  });

  it('updates activeTab, selectedTeamId, and unreadChat via their setters', () => {
    const { result } = renderHook(() => useDraftUIState());

    act(() => {
      result.current.setActiveTab('team');
      result.current.setSelectedTeamId(7);
      result.current.setUnreadChat(true);
    });

    expect(result.current.activeTab).toBe('team');
    expect(result.current.selectedTeamId).toBe(7);
    expect(result.current.unreadChat).toBe(true);
  });

  it('enqueues and dequeues pick toasts in FIFO order', () => {
    const { result } = renderHook(() => useDraftUIState());

    expect(result.current.pickToastQueue).toEqual([]);

    act(() => {
      result.current.enqueuePickToast({
        id: 'toast-1',
        player,
        pickNumber: 1,
        round: 1,
        roundPickNumber: 1,
        teamName: 'Dinger Dynasty',
        isAuto: true,
      });
      result.current.enqueuePickToast({
        id: 'toast-2',
        player,
        pickNumber: 2,
        round: 1,
        roundPickNumber: 2,
        teamName: 'Bronx Bombers',
        isAuto: false,
      });
    });

    expect(result.current.pickToastQueue.map((t) => t.id)).toEqual([
      'toast-1',
      'toast-2',
    ]);

    act(() => {
      result.current.dequeuePickToast();
    });

    expect(result.current.pickToastQueue.map((t) => t.id)).toEqual(['toast-2']);
  });

  it('enqueues and dequeues pick splashes in FIFO order', () => {
    const { result } = renderHook(() => useDraftUIState());

    expect(result.current.pickSplashQueue).toEqual([]);

    act(() => {
      result.current.enqueuePickSplash({
        id: 'splash-1',
        player,
        pickNumber: 5,
        round: 1,
        roundPickNumber: 5,
      });
    });

    expect(result.current.pickSplashQueue).toHaveLength(1);

    act(() => {
      result.current.dequeuePickSplash();
    });

    expect(result.current.pickSplashQueue).toEqual([]);
  });

  it('caps the pick toast queue during a flood of rapid auto-picks', () => {
    const { result } = renderHook(() => useDraftUIState());

    // 8 rapid-fire auto-picks (e.g. a commissioner auto-drafting the rest of
    // the league) must not queue every toast — that would re-trigger the
    // popup every ~1.9s long after the picks happened (stuttery back-to-back
    // popups).
    act(() => {
      for (let i = 1; i <= 8; i += 1) {
        result.current.enqueuePickToast({
          id: `toast-${i}`,
          player,
          pickNumber: i,
          round: 1,
          roundPickNumber: i,
          teamName: `Team ${i}`,
          isAuto: true,
        });
      }
    });

    // 8 enqueues against TOAST_FLOOD_QUEUE_LENGTH=5 / TOAST_FLOOD_KEEP_NEWEST=2
    // trims deterministically to 4: the flood trim fires once length crosses
    // 5 (at enqueue #6, trimming to the newest 2), then #7 and #8 land
    // without re-crossing the threshold.
    expect(result.current.pickToastQueue.map((t) => t.id)).toEqual([
      'toast-5',
      'toast-6',
      'toast-7',
      'toast-8',
    ]);
  });

  it('caps the pick splash queue during a flood of rapid auto-picks', () => {
    const { result } = renderHook(() => useDraftUIState());

    act(() => {
      for (let i = 1; i <= 8; i += 1) {
        result.current.enqueuePickSplash({
          id: `splash-${i}`,
          player,
          pickNumber: i,
          round: 1,
          roundPickNumber: i,
        });
      }
    });

    expect(result.current.pickSplashQueue.map((s) => s.id)).toEqual([
      'splash-5',
      'splash-6',
      'splash-7',
      'splash-8',
    ]);
  });
});

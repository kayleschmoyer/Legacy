/**
 * Tests for the pick-splash YouTube highlight embed tier (LS-9113):
 *   - No cached video → fallback renders immediately, no player is created
 *   - Cached video → official IFrame player mounts with the compliant
 *     autoplay=1&mute=1&playsinline=1 params and ≥200×200 size
 *   - No first frame within the timeout → player destroyed, fallback shown
 *     (also the path an ad-consumed splash window takes — no ad detection)
 *   - PLAYING before the timeout → video stays up
 *   - Unmount destroys the player (no hidden playback after splash exit)
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { PickSplashHighlightVideo } from './PickSplashHighlightVideo';

const PLAYING = 1;

interface CapturedPlayer {
  options: {
    videoId: string;
    width: number;
    height: number;
    playerVars: Record<string, string | number>;
    events: { onStateChange: (event: { data: number }) => void };
  };
  destroy: jest.Mock;
}

let createdPlayers: CapturedPlayer[];

function stubYouTubeApi() {
  createdPlayers = [];
  window.YT = {
    Player: class {
      destroy: jest.Mock;
      constructor(_element: HTMLElement, options: CapturedPlayer['options']) {
        this.destroy = jest.fn();
        createdPlayers.push({ options, destroy: this.destroy });
      }
    },
    PlayerState: { PLAYING },
  };
}

const video = {
  playerId: 42,
  youtubeVideoId: 'dQw4w9WgXcQ',
  videoTitle: 'Johnny Mize highlights',
};

describe('PickSplashHighlightVideo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    stubYouTubeApi();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
  });

  it('renders the fallback immediately when no video is cached', () => {
    render(
      <PickSplashHighlightVideo
        video={null}
        playerName="Johnny Mize"
        fallback={<div data-testid="graphic-fallback" />}
      />,
    );
    expect(screen.getByTestId('graphic-fallback')).toBeTruthy();
    expect(screen.queryByTestId('splash-highlight-video')).toBeNull();
    expect(createdPlayers).toHaveLength(0);
  });

  it('mounts the official IFrame player with compliant autoplay params and size', async () => {
    render(<PickSplashHighlightVideo video={video} playerName="Johnny Mize" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(createdPlayers).toHaveLength(1);
    const { options } = createdPlayers[0];
    expect(options.videoId).toBe('dQw4w9WgXcQ');
    expect(options.playerVars).toMatchObject({
      autoplay: 1,
      mute: 1,
      playsinline: 1,
    });
    // ToS minimum player size is 200×200.
    expect(options.width).toBeGreaterThanOrEqual(200);
    expect(options.height).toBeGreaterThanOrEqual(200);
    expect(screen.getByTestId('splash-highlight-video')).toBeTruthy();
  });

  it('destroys the player and falls back when no first frame arrives in time', async () => {
    render(
      <PickSplashHighlightVideo
        video={video}
        playerName="Johnny Mize"
        fallback={<div data-testid="graphic-fallback" />}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(2500);
    });

    expect(createdPlayers[0].destroy).toHaveBeenCalled();
    expect(screen.getByTestId('graphic-fallback')).toBeTruthy();
    expect(screen.queryByTestId('splash-highlight-video')).toBeNull();
  });

  it('keeps the video up when PLAYING fires before the timeout', async () => {
    render(
      <PickSplashHighlightVideo
        video={video}
        playerName="Johnny Mize"
        fallback={<div data-testid="graphic-fallback" />}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      createdPlayers[0].options.events.onStateChange({ data: PLAYING });
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(createdPlayers[0].destroy).not.toHaveBeenCalled();
    expect(screen.getByTestId('splash-highlight-video')).toBeTruthy();
    expect(screen.queryByTestId('graphic-fallback')).toBeNull();
  });

  it('destroys the player on unmount — no hidden playback after splash exit', async () => {
    const { unmount } = render(
      <PickSplashHighlightVideo video={video} playerName="Johnny Mize" />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(createdPlayers[0].destroy).toHaveBeenCalled();
  });
});

import React, { useEffect, useRef, useState } from 'react';
import type { HighlightVideoSummary } from './types';

// ---------------------------------------------------------------------------
// PickSplashHighlightVideo — YouTube highlight embed tier for the spectator
// pick splash (LS-9113).
//
// Plays the drafted player's validated MLB-official-channel highlight video
// through the official YouTube IFrame Player API (the YouTube-sanctioned
// embed path for rightsholder-uploaded, embed-enabled videos — spike
// LS-9111). Falls back to the `fallback` slot (the LS-9095 stat graphic)
// when no cached video exists or no first frame arrives within the timeout —
// which also covers a pre-roll ad consuming the splash window, without any
// attempt to detect, skip, or suppress the ad (ToS: ad interference is
// prohibited; the timer only watches for our own first frame).
//
// ToS/RMF compliance encoded here:
//  - Official IFrame embed with autoplay=1&mute=1&playsinline=1 (muted
//    autoplay is browser- and ToS-sanctioned).
//  - Player is 480×270 — above the 200×200 minimum — and fully visible
//    (>50% visibility requirement); nothing is ever rendered on top of any
//    part of the player (RMF overlay prohibition) — the pick banner and
//    player name are ADJACENT siblings in the splash chrome column.
//  - Exactly one autoplaying player per page: structural — the splash queue
//    renders at most one active splash, and this component is keyed per pick.
//  - The player is destroyed on unmount (splash exit / pick undo), so no
//    hidden playback ever continues.
//
// Web-only, like the rest of the splash chrome — the native spectator screen
// keeps its own deliberately separate announcement tree.
// ---------------------------------------------------------------------------

/** No first frame within this window → graphic fallback (spike median ~800ms). */
export const FIRST_FRAME_TIMEOUT_MS = 2500;

/** Minimal surface of the IFrame Player API this component uses. */
interface YTPlayer {
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: number;
      height: number;
      playerVars: Record<string, string | number>;
      events: {
        onStateChange: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { PLAYING: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let iframeApiPromise: Promise<YTNamespace> | null = null;

/**
 * Load the official IFrame Player API once per page. Never rejects — a
 * failed load simply never resolves, and the first-frame timeout handles it.
 */
function loadYouTubeIframeApi(): Promise<YTNamespace> {
  // SSR guard — never resolves; the first-frame timeout owns the fallback.
  if (typeof window === 'undefined') {
    return new Promise<YTNamespace>(() => undefined);
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!iframeApiPromise) {
    iframeApiPromise = new Promise<YTNamespace>((resolve) => {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return iframeApiPromise;
}

export interface PickSplashHighlightVideoProps {
  /** Validated cached video for the drafted player — null uses the fallback tier. */
  video: HighlightVideoSummary | null;
  /** Accessible label context ("<name> highlight video"). */
  playerName: string;
  /** The LS-9095 stat-graphic tier, rendered when no video plays. */
  fallback?: React.ReactNode;
  /** Override for tests. */
  firstFrameTimeoutMs?: number;
}

type Phase = 'loading' | 'playing' | 'fallback';

export function PickSplashHighlightVideo({
  video,
  playerName,
  fallback,
  firstFrameTimeoutMs = FIRST_FRAME_TIMEOUT_MS,
}: PickSplashHighlightVideoProps): React.ReactNode {
  const [phase, setPhase] = useState<Phase>('loading');
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoId = video?.youtubeVideoId ?? null;

  useEffect(() => {
    if (!videoId) return undefined;
    let cancelled = false;
    let player: YTPlayer | null = null;
    const destroyPlayer = () => {
      // Destroying the player is what guarantees no hidden playback — on
      // fallback, splash exit, and pick undo alike.
      try {
        player?.destroy();
      } catch {
        // Player teardown after the iframe is gone is a no-op.
      }
      player = null;
    };
    const timeout = setTimeout(() => {
      if (cancelled) return;
      destroyPlayer();
      setPhase('fallback');
    }, firstFrameTimeoutMs);

    void loadYouTubeIframeApi().then((yt) => {
      if (cancelled || !mountRef.current) return;
      player = new yt.Player(mountRef.current, {
        videoId,
        width: 480,
        height: 270,
        playerVars: {
          autoplay: 1,
          mute: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === yt.PlayerState.PLAYING) {
              clearTimeout(timeout);
              setPhase((current) =>
                current === 'loading' ? 'playing' : current,
              );
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      destroyPlayer();
    };
  }, [videoId, firstFrameTimeoutMs]);

  if (!videoId || phase === 'fallback') {
    return fallback ?? null;
  }

  return (
    <div
      className={`d-splash-video${phase === 'playing' ? ' playing' : ''}`}
      data-testid="splash-highlight-video"
      role="region"
      aria-label={`${playerName} highlight video`}
    >
      <div className="d-splash-video-frame" ref={mountRef} />
    </div>
  );
}

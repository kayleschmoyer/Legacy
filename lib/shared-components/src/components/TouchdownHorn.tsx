/**
 * TouchdownHorn (web) — capability shim of ./TouchdownHorn.native.tsx: plays
 * the short touchdown horn through an HTMLAudioElement where the native pair
 * uses expo-audio (LS-10195).
 *
 * Renders nothing. Plays once each time `seed` increases, and only when the
 * caller passes `enabled` (the user's explicit `audioEnabled` opt-in) and the
 * user has not asked for reduced motion — never on mount and never because
 * `enabled` flipped on, so turning the preference on cannot replay an old
 * touchdown.
 */
import React from 'react';
import { LOGGER } from '@legacy-sports/logging';
import hornSource from '../assets/audio/touchdown-horn.wav';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { toError } from '../utils/toError';

export interface TouchdownHornProps {
  /** Increments once per touchdown; `0` (or an unchanged value) never plays. */
  seed: number;
  /** The user's explicit audio opt-in. Off (the default) is always silent. */
  enabled: boolean;
}

export function TouchdownHorn({ seed, enabled }: TouchdownHornProps): null {
  const reducedMotion = useReducedMotion();
  // Read through refs so the effect below fires on `seed` alone.
  const allowedRef = React.useRef(false);
  allowedRef.current = enabled && !reducedMotion;
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const lastPlayedSeedRef = React.useRef(0);

  React.useEffect(() => {
    if (seed <= lastPlayedSeedRef.current) return;
    lastPlayedSeedRef.current = seed;
    if (!allowedRef.current) return;
    if (typeof Audio === 'undefined') return;
    try {
      const audio = audioRef.current ?? new Audio(hornSource);
      audioRef.current = audio;
      audio.currentTime = 0;
      // Browsers reject play() before a user gesture; a missed cue is fine.
      audio.play().catch((error: unknown) => {
        LOGGER.debug('Touchdown horn playback was blocked', toError(error));
      });
    } catch (error) {
      LOGGER.debug('Touchdown horn playback failed', toError(error));
    }
  }, [seed]);

  return null;
}

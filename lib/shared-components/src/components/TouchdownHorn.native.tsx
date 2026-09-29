/**
 * TouchdownHorn (native) — plays the short touchdown horn with expo-audio.
 * See ./TouchdownHorn.tsx for the web capability shim and the playback rules
 * (LS-10195): once per `seed` increase, only with the explicit `enabled`
 * opt-in, never on mount.
 */
import React from 'react';
import { useAudioPlayer } from 'expo-audio';
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
  const player = useAudioPlayer(hornSource);
  const allowedRef = React.useRef(false);
  allowedRef.current = enabled && !reducedMotion;
  const lastPlayedSeedRef = React.useRef(0);

  React.useEffect(() => {
    if (seed <= lastPlayedSeedRef.current) return;
    lastPlayedSeedRef.current = seed;
    if (!allowedRef.current) return;
    try {
      // Rewind first so a second touchdown restarts the horn from the top.
      player
        .seekTo(0)
        .then(() => player.play())
        .catch((error: unknown) => {
          LOGGER.debug('Touchdown horn playback failed', toError(error));
        });
    } catch (error) {
      LOGGER.debug('Touchdown horn playback failed', toError(error));
    }
  }, [seed, player]);

  return null;
}

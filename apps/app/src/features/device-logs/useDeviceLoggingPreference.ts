import { useCallback, useEffect, useState } from 'react';
import { secureStorage } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import {
  DEVICE_LOGS_PREF_KEY,
  disableDeviceLogging,
  enableDeviceLogging,
} from './deviceLogs';

export interface DeviceLoggingPreference {
  /** Whether the toggle is on for this user. */
  enabled: boolean;
  /** Update the toggle. Persists to secureStorage and (un)registers the destination. */
  setEnabled: (next: boolean) => Promise<void>;
  /** True once the persisted preference has been read at least once. */
  loaded: boolean;
}

/**
 * Reads and writes the `enable_device_logs` preference and synchronises the
 * device-file LOGGER destination accordingly. The destination is only
 * registered when both `isAdmin` is true and the preference is enabled —
 * non-admins can never trigger device logging even if the key is somehow
 * set in storage.
 */
export function useDeviceLoggingPreference(
  isAdmin: boolean,
): DeviceLoggingPreference {
  const [enabled, setEnabledState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await secureStorage.hasItem(DEVICE_LOGS_PREF_KEY);
        const stored = await secureStorage.getItem(DEVICE_LOGS_PREF_KEY);
        const wantEnabled = isAdmin && stored === 'true';
        if (cancelled) return;
        setEnabledState(wantEnabled);
        if (wantEnabled) {
          await enableDeviceLogging();
        } else {
          disableDeviceLogging();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to load device-logs preference', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      const effective = isAdmin && next;
      setEnabledState(effective);
      try {
        await secureStorage.setItem(
          DEVICE_LOGS_PREF_KEY,
          effective ? 'true' : 'false',
        );
        if (effective) {
          await enableDeviceLogging();
        } else {
          disableDeviceLogging();
        }
      } catch {
        // Silently ignore — client-side persistence is best-effort
        // (private browsing, quota exceeded, etc. are not load-bearing).
      }
    },
    [isAdmin],
  );

  return { enabled, setEnabled, loaded };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Fingerprint of the last Expo push token this install successfully sent to the
 * backend. Push registration runs on mount, on every OS token rotation and on
 * every foreground transition, so without this every app resume re-registered
 * an unchanged token (LS-9541).
 *
 * Kept in its own module so the logout path can invalidate it without pulling
 * in the notification hook (which configures expo-notifications on import).
 */
const STORAGE_KEY = 'ls.push.lastRegistration';

/**
 * Re-assert an unchanged registration once a week. The backend row can vanish
 * without the device knowing, and push failures surface no error to the user,
 * so the skip is bounded rather than permanent.
 */
const REGISTRATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredRegistration {
  userId: number;
  token: string;
  registeredAt: number;
}

async function read(): Promise<StoredRegistration | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { userId, token, registeredAt } = parsed as Record<string, unknown>;
    if (
      typeof userId !== 'number' ||
      typeof token !== 'string' ||
      typeof registeredAt !== 'number'
    ) {
      return null;
    }
    return { userId, token, registeredAt };
  } catch {
    // Unreadable or corrupt — fail open so registration still happens.
    return null;
  }
}

/**
 * True only when this exact user + token pair was registered recently. Every
 * uncertain case (no record, different user, rotated token, stale or
 * future-dated timestamp) falls through to registering.
 */
export async function isPushTokenAlreadyRegistered(
  userId: number,
  token: string,
): Promise<boolean> {
  const last = await read();
  if (!last) return false;
  if (last.userId !== userId) return false;
  if (last.token !== token) return false;
  const age = Date.now() - last.registeredAt;
  return age >= 0 && age < REGISTRATION_TTL_MS;
}

export async function recordPushTokenRegistration(
  userId: number,
  token: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId,
        token,
        registeredAt: Date.now(),
      } satisfies StoredRegistration),
    );
  } catch {
    LOGGER.info('Could not persist push registration fingerprint');
  }
}

/**
 * Invalidate the fingerprint so the next sign-in re-registers. Logout
 * deactivates the device token server-side (see the You tab's logout handler),
 * so skipping registration afterwards would leave push silently disabled.
 */
export async function clearPushTokenRegistration(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    LOGGER.info('Could not clear push registration fingerprint');
  }
}

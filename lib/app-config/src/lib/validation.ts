import { CONFIG_KEYS } from './registry';
import type { AppConfig } from './types';

export function validateConfig(
  values: Record<string, string | undefined>,
): AppConfig {
  const missing = Object.entries(CONFIG_KEYS)
    .filter(([key, entry]) => entry.required && !values[key])
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `app-config: required keys are not configured: ${missing.join(', ')}`,
    );
  }

  return values as unknown as AppConfig;
}

/**
 * Sport-aware chrome for the Season Draft create/lobby/join surfaces (LS-4664).
 *
 * Mirrors the lobby chrome shape used by the elite-draft PreDraftLobby so the
 * "Dead Ball Dynasty" / "Gridiron Dynasty" voice is consistent across surfaces.
 * Keep this map narrow — it's strapline + icon + helper copy only, not a full
 * sport config. Broader sport metadata lives in `lib/shared-components/config/sports.ts`.
 */

export type SportKind = 'baseball' | 'football';

export interface SportLobbyChrome {
  /** Emoji used in lobby headers and the create-form preview. */
  icon: string;
  /** Accessible label for the icon (announces "baseball" / "football"). */
  iconLabel: string;
  /** Editorial strapline shown above the league title — matches ADR 0011 voice. */
  strapline: string;
  /** Helper sentence under the create-form sport selector. */
  helperText: string;
  /** Short label used inline (e.g. "Football draft"). */
  shortLabel: string;
}

export const SPORT_LOBBY_CHROME: Record<SportKind, SportLobbyChrome> = {
  baseball: {
    icon: '⚾',
    iconLabel: 'baseball',
    strapline: 'Dead Ball Dynasty',
    helperText:
      'Hitters, pitchers, and historic seasons. The classic Legacy draft.',
    shortLabel: 'Baseball',
  },
  football: {
    icon: '🏈',
    iconLabel: 'football',
    strapline: 'Gridiron Dynasty',
    helperText:
      'Gridiron icons and franchise legends. Football draft surfaces are preview-only for now.',
    shortLabel: 'Football',
  },
};

/** Normalize an upstream sport value (Sport enum, raw string, or undefined) into a SportKind. */
export function toSportKind(value: string | null | undefined): SportKind {
  return value === 'football' ? 'football' : 'baseball';
}

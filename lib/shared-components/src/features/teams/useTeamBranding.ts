import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useRenameTeamMutation,
  useUpdateTeamBrandingMutation,
} from '@legacy-sports/graphql';

/**
 * Shared team-branding editor logic (LS-7809).
 *
 * Web's canonical league-detail v2 "Team" tab and native's team Settings tab
 * both edit a team's name, brand colors, and logo. This hook owns the
 * cross-platform save wiring (form state, dirty tracking, rename + branding
 * mutations, the transient "Saved" flash) so neither platform duplicates it.
 * Each platform supplies its own presentation (web keeps its bespoke editorial
 * markup; native renders {@link TeamBrandingControl}).
 */

/**
 * Brand color presets offered for team primary/secondary colors. Mirrors the
 * heritage palette from the design system. The first entry is the default
 * primary; index 5 (gold) is the default secondary.
 */
export const TEAM_BRANDING_PRESET_COLORS = [
  '#1B3A5C',
  '#C41E3A',
  '#2D6A4F',
  '#8B6F47',
  '#7C6CAE',
  '#C5A55A',
  '#0E7490',
  '#9F1239',
] as const;

const DEFAULT_PRIMARY = TEAM_BRANDING_PRESET_COLORS[0];
const DEFAULT_SECONDARY = TEAM_BRANDING_PRESET_COLORS[5];

/** Initials for a team name, e.g. "The Mighty Sluggers" → "TS". */
export const initialsFromTeamName = (name?: string | null): string => {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Uppercase hex colors so preset comparisons are stable; pass through others. */
export const normalizeTeamColor = (
  c: string | null | undefined,
  fallback: string,
): string => {
  if (!c) return fallback;
  return c.startsWith('#') ? c.toUpperCase() : c;
};

/** Minimal team shape the editor seeds from. */
export interface TeamBrandingTeam {
  id?: number | null;
  name?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  logoUrl?: string | null;
}

type SavedFlash = 'name' | 'branding' | null;

export interface UseTeamBrandingOptions {
  teamId: number | null;
  leagueId: number | null;
  team: TeamBrandingTeam | null;
  /** Called after a successful save with which form was saved. */
  onSaved?: (kind: 'name' | 'branding') => void;
  /**
   * Called when a mutation rejects. When omitted the error is rethrown so
   * callers that don't opt into handling still surface failures.
   */
  onError?: (error: Error) => void;
}

export interface UseTeamBrandingResult {
  name: string;
  setName: (next: string) => void;
  primaryColor: string;
  setPrimaryColor: (next: string) => void;
  secondaryColor: string;
  setSecondaryColor: (next: string) => void;
  logoUrl: string;
  setLogoUrl: (next: string) => void;
  /** The currently-persisted team name (used for dirty comparison / labels). */
  currentTeamName: string;
  /** `name` trimmed of surrounding whitespace. */
  trimmedName: string;
  /** True when the trimmed name is non-empty and differs from the saved name. */
  nameDirty: boolean;
  /** True when colors or logo differ from the last-persisted values. */
  brandingDirty: boolean;
  renaming: boolean;
  savingBranding: boolean;
  savedFlash: SavedFlash;
  presetColors: readonly string[];
  /** Persist the (trimmed) team name. No-op when not dirty or missing ids. */
  saveName: () => Promise<void>;
  /** Persist colors + logo. No-op when missing ids. */
  saveBranding: () => Promise<void>;
  /** Reset colors + logo back to the last-persisted values. */
  resetBranding: () => void;
}

export function useTeamBranding({
  teamId,
  leagueId,
  team,
  onSaved,
  onError,
}: UseTeamBrandingOptions): UseTeamBrandingResult {
  const [name, setName] = useState(team?.name ?? '');
  const [primaryColor, setPrimaryColor] = useState(
    normalizeTeamColor(team?.primaryColor, DEFAULT_PRIMARY),
  );
  const [secondaryColor, setSecondaryColor] = useState(
    normalizeTeamColor(team?.secondaryColor, DEFAULT_SECONDARY),
  );
  const [logoUrl, setLogoUrl] = useState(team?.logoUrl ?? '');
  const [savedFlash, setSavedFlash] = useState<SavedFlash>(null);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearFlashTimer = () => {
    if (flashTimer.current) {
      clearTimeout(flashTimer.current);
      flashTimer.current = null;
    }
  };
  const flash = useCallback((kind: 'name' | 'branding') => {
    clearFlashTimer();
    setSavedFlash(kind);
    flashTimer.current = setTimeout(() => setSavedFlash(null), 1500);
  }, []);
  useEffect(() => clearFlashTimer, []);

  // Re-seed form values when the underlying team arrives or changes (e.g. a
  // different team is selected).
  useEffect(() => {
    if (team) {
      setName(team.name ?? '');
      setPrimaryColor(normalizeTeamColor(team.primaryColor, DEFAULT_PRIMARY));
      setSecondaryColor(
        normalizeTeamColor(team.secondaryColor, DEFAULT_SECONDARY),
      );
      setLogoUrl(team.logoUrl ?? '');
    }
  }, [
    team?.id,
    team?.name,
    team?.primaryColor,
    team?.secondaryColor,
    team?.logoUrl,
    team,
  ]);

  // Reset the saved flash whenever the active team changes.
  useEffect(() => {
    setSavedFlash(null);
  }, [teamId]);

  const [renameTeam, { loading: renaming }] = useRenameTeamMutation();
  const [updateBranding, { loading: savingBranding }] =
    useUpdateTeamBrandingMutation();

  const currentTeamName = team?.name ?? '';
  const trimmedName = name.trim();
  const nameDirty = trimmedName.length > 0 && trimmedName !== currentTeamName;

  const savedPrimary = normalizeTeamColor(team?.primaryColor, DEFAULT_PRIMARY);
  const savedSecondary = normalizeTeamColor(
    team?.secondaryColor,
    DEFAULT_SECONDARY,
  );
  const savedLogoUrl = team?.logoUrl ?? '';
  const brandingDirty =
    primaryColor !== savedPrimary ||
    secondaryColor !== savedSecondary ||
    logoUrl !== savedLogoUrl;

  const resetBranding = useCallback(() => {
    setPrimaryColor(savedPrimary);
    setSecondaryColor(savedSecondary);
    setLogoUrl(savedLogoUrl);
  }, [savedPrimary, savedSecondary, savedLogoUrl]);

  const reportError = useCallback(
    (err: unknown) => {
      const error = err instanceof Error ? err : new Error('Unknown error');
      if (onError) {
        onError(error);
        return;
      }
      throw error;
    },
    [onError],
  );

  const saveName = useCallback(async () => {
    if (!teamId || !leagueId || !nameDirty) return;
    try {
      await renameTeam({
        variables: { teamId, leagueId, newName: trimmedName },
      });
      flash('name');
      onSaved?.('name');
    } catch (err) {
      reportError(err);
    }
  }, [
    teamId,
    leagueId,
    nameDirty,
    trimmedName,
    renameTeam,
    flash,
    onSaved,
    reportError,
  ]);

  const saveBranding = useCallback(async () => {
    if (!teamId || !leagueId) return;
    try {
      await updateBranding({
        variables: {
          teamId,
          leagueId,
          primaryColor,
          secondaryColor,
          logoUrl: logoUrl || null,
        },
      });
      flash('branding');
      onSaved?.('branding');
    } catch (err) {
      reportError(err);
    }
  }, [
    teamId,
    leagueId,
    primaryColor,
    secondaryColor,
    logoUrl,
    updateBranding,
    flash,
    onSaved,
    reportError,
  ]);

  return {
    name,
    setName,
    primaryColor,
    setPrimaryColor,
    secondaryColor,
    setSecondaryColor,
    logoUrl,
    setLogoUrl,
    currentTeamName,
    trimmedName,
    nameDirty,
    brandingDirty,
    renaming,
    savingBranding,
    savedFlash,
    presetColors: TEAM_BRANDING_PRESET_COLORS,
    saveName,
    saveBranding,
    resetBranding,
  };
}

import React from 'react';
import { Text, XStack } from 'tamagui';
import { FG3, FONT_DISPLAY } from './tokens';
import { NativeSelect } from './NativeSelect';
import { Platform } from '../../../platform-components';
import { csp } from '../crossPlatformStyle';

/** A league entry shown in the availability-filter league picker (LS-7044). */
export interface LeagueOption {
  id: number;
  name: string;
}

const ALL_LEAGUES_LABEL = 'All Leagues';

export interface LeaguePickerProps {
  leagues: ReadonlyArray<LeagueOption>;
  /** Selected league id, or `null` for the "All Leagues" sentinel. */
  leagueId: number | null;
  onChange: (id: number | null) => void;
  /** Visible caption + accessible label prefix. Default: "League". */
  label?: string;
  /**
   * When `false`, no "All Leagues" option is offered — the caller guarantees
   * `leagueId` is always one of `leagues`. Used where an aggregate-across-
   * leagues selection would be data-ambiguous (LS-9158). Default: `true`.
   */
  allowAll?: boolean;
  /**
   * Optional className applied to the web `<select>` for page-specific
   * styling (e.g. PlayersScreen's `.pp-league-sel`). Ignored on native.
   */
  webClassName?: string;
  /** Optional className applied to the web label text. Ignored on native. */
  webLabelClassName?: string;
}

/**
 * League selector for the availability filter. Lets a multi-league viewer
 * scope "Free Agents"/"Rostered" to one league's roster instead of an
 * ambiguous cross-league aggregate. Originally built for the standalone
 * `/players` page (LS-7044) and shared with `/players/stats`'s
 * {@link PlayerStatsShell} (LS-9158) so both surfaces render the same picker.
 */
export function LeaguePicker({
  leagues,
  leagueId,
  onChange,
  label = 'League',
  allowAll = true,
  webClassName,
  webLabelClassName,
}: LeaguePickerProps) {
  if (Platform.OS !== 'web') {
    const options = allowAll
      ? [ALL_LEAGUES_LABEL, ...leagues.map((l) => l.name)]
      : leagues.map((l) => l.name);
    const selected = leagues.find((l) => l.id === leagueId);
    const value = selected?.name ?? (allowAll ? ALL_LEAGUES_LABEL : options[0]);
    return (
      <NativeSelect
        label={label}
        value={value}
        options={options}
        onChange={(name) => {
          if (allowAll && name === ALL_LEAGUES_LABEL) {
            onChange(null);
            return;
          }
          const match = leagues.find((l) => l.name === name);
          if (match) onChange(match.id);
        }}
      />
    );
  }

  return (
    <XStack alignItems="center" gap={4}>
      <Text
        className={webLabelClassName}
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '700',
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: FG3,
          marginRight: 4,
        })}
      >
        {label}
      </Text>
      <select
        className={webClassName}
        aria-label={`Select ${label.toLowerCase()} for availability filter`}
        value={leagueId ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : parseInt(raw, 10));
        }}
      >
        {allowAll && <option value="">{ALL_LEAGUES_LABEL}</option>}
        {leagues.map((lg) => (
          <option key={lg.id} value={lg.id}>
            {lg.name}
          </option>
        ))}
      </select>
    </XStack>
  );
}

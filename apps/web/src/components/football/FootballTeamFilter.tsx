import React from 'react';
import { Select, XStack, YStack } from 'tamagui';
import { Check } from '@tamagui/lucide-icons/icons/Check';
import { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown';
import type { NflTeam } from '@legacy-sports/shared-components';
import { NFL_TEAMS, StatusBadge } from '@legacy-sports/shared-components';
import type { SosTier } from '@legacy-sports/graphql';
import {
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../constants/colors';

export interface NflTeamMetadataEntry {
  teamAbbreviation: string;
  byeWeek: number;
  sosTier: SosTier;
}

export type TeamFilter = string;

const CONFERENCE_OPTIONS: Array<{ value: TeamFilter; label: string }> = [
  { value: 'All', label: 'All Teams' },
  { value: 'FREE_AGENT', label: 'Free Agents' },
  { value: 'AFC', label: 'AFC' },
  { value: 'NFC', label: 'NFC' },
];

const CONFERENCE_ORDER: Record<string, number> = { AFC: 0, NFC: 1 };
const DIVISION_ORDER: Record<string, number> = {
  East: 0,
  North: 1,
  South: 2,
  West: 3,
};

const TEAM_OPTIONS = Object.values(NFL_TEAMS)
  .filter((t): t is NflTeam => t != null)
  .sort((a, b) => {
    const cDiff =
      (CONFERENCE_ORDER[a.conference] ?? 99) -
      (CONFERENCE_ORDER[b.conference] ?? 99);
    if (cDiff !== 0) return cDiff;
    const dDiff =
      (DIVISION_ORDER[a.division] ?? 99) - (DIVISION_ORDER[b.division] ?? 99);
    if (dDiff !== 0) return dDiff;
    return a.city.localeCompare(b.city);
  })
  .map((t) => ({
    value: t.abbreviation,
    label: `${t.abbreviation} — ${t.fullName}`,
  }));

const SOS_VARIANT: Record<SosTier, 'success' | 'warning' | 'error'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error',
};

const SOS_LABEL: Record<SosTier, string> = {
  easy: 'Easy',
  medium: 'Med',
  hard: 'Hard',
};

interface Props {
  selected: TeamFilter;
  onChange: (team: TeamFilter) => void;
  /** Per-team bye/SoS metadata — only supplied for entitled premium users. */
  teamMetadata?: NflTeamMetadataEntry[];
}

// Tamagui's BubbleSelect only populates native <select> options after the
// dropdown is opened (lazy mount). We render our own always-present native
// select so E2E tests can target select[name="team-filter"] without opening.
const HIDDEN_SELECT_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  opacity: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
};

export function FootballTeamFilter({
  selected,
  onChange,
  teamMetadata,
}: Props) {
  const metaByTeam = React.useMemo(() => {
    if (!teamMetadata) return null;
    const map = new Map<string, NflTeamMetadataEntry>();
    for (const entry of teamMetadata) {
      map.set(entry.teamAbbreviation, entry);
    }
    return map;
  }, [teamMetadata]);
  const selectedLabel =
    selected === 'All'
      ? 'All Teams'
      : selected === 'FREE_AGENT'
        ? 'Free Agents'
        : selected === 'AFC' || selected === 'NFC'
          ? selected
          : (NFL_TEAMS[selected]?.fullName ?? selected);

  return (
    <>
      <select
        name="team-filter"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        aria-hidden="true"
        tabIndex={-1}
        style={HIDDEN_SELECT_STYLE}
      >
        {CONFERENCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        {TEAM_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Select
        value={selected}
        onValueChange={(v) => onChange(v)}
        disablePreventBodyScroll
      >
        <Select.Trigger
          data-testid="team-filter-trigger"
          width={200}
          borderColor={OUTLINE_SUBTLE}
          backgroundColor={SURFACE_CARD}
          color={TEXT_PRIMARY}
          iconAfter={ChevronDown}
          borderRadius={8}
          paddingHorizontal={12}
          height={36}
        >
          <Select.Value
            placeholder="All Teams"
            color={TEXT_PRIMARY}
            fontSize={14}
          >
            {selectedLabel}
          </Select.Value>
        </Select.Trigger>

        <Select.Content zIndex={200000}>
          <Select.ScrollUpButton />
          <Select.Viewport
            backgroundColor={SURFACE_PANEL}
            borderColor={OUTLINE_SUBTLE}
            borderWidth={1}
            borderRadius={8}
            minWidth={220}
          >
            <Select.Group>
              {CONFERENCE_OPTIONS.map((opt, i) => (
                <Select.Item
                  key={opt.value}
                  index={i}
                  value={opt.value}
                  backgroundColor={SURFACE_PANEL}
                  hoverStyle={{ backgroundColor: SURFACE_CARD }}
                >
                  <Select.ItemText color={TEXT_PRIMARY} fontSize={14}>
                    {opt.label}
                  </Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={14} color={TEXT_PRIMARY} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
              <YStack
                height={1}
                backgroundColor={OUTLINE_SUBTLE}
                marginVertical={4}
              />
              {TEAM_OPTIONS.map((opt, i) => {
                const meta = metaByTeam?.get(opt.value);
                return (
                  <Select.Item
                    key={opt.value}
                    index={i + CONFERENCE_OPTIONS.length + 1}
                    value={opt.value}
                    backgroundColor={SURFACE_PANEL}
                    hoverStyle={{ backgroundColor: SURFACE_CARD }}
                  >
                    <XStack flex={1} alignItems="center" gap={6}>
                      <Select.ItemText color={TEXT_MUTED} fontSize={13}>
                        {opt.label}
                      </Select.ItemText>
                      {meta != null && (
                        <XStack
                          gap={4}
                          accessibilityLabel={`Bye week ${meta.byeWeek}, Strength of schedule: ${SOS_LABEL[meta.sosTier]}`}
                        >
                          <StatusBadge
                            label={`Bye ${meta.byeWeek}`}
                            variant="neutral"
                            size="xs"
                          />
                          <StatusBadge
                            label={`SoS: ${SOS_LABEL[meta.sosTier]}`}
                            variant={SOS_VARIANT[meta.sosTier]}
                            size="xs"
                          />
                        </XStack>
                      )}
                    </XStack>
                    <Select.ItemIndicator>
                      <Check size={14} color={TEXT_PRIMARY} />
                    </Select.ItemIndicator>
                  </Select.Item>
                );
              })}
            </Select.Group>
          </Select.Viewport>
          <Select.ScrollDownButton />
        </Select.Content>
      </Select>
    </>
  );
}

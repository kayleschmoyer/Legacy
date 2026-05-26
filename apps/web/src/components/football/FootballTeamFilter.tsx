import React from 'react';
import { Select, YStack } from 'tamagui';
import { Check, ChevronDown } from '@tamagui/lucide-icons';
import { NFL_TEAMS } from '@legacy-sports/shared-components';
import {
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from '../../constants/colors';

export type TeamFilter = string;

const CONFERENCE_OPTIONS: Array<{ value: TeamFilter; label: string }> = [
  { value: 'All', label: 'All Teams' },
  { value: 'AFC', label: 'AFC' },
  { value: 'NFC', label: 'NFC' },
];

const TEAM_OPTIONS = Object.values(NFL_TEAMS).map((t) => ({
  value: t.abbreviation,
  label: `${t.abbreviation} — ${t.fullName}`,
}));

interface Props {
  selected: TeamFilter;
  onChange: (team: TeamFilter) => void;
}

export function FootballTeamFilter({ selected, onChange }: Props) {
  const selectedLabel =
    selected === 'All'
      ? 'All Teams'
      : selected === 'AFC' || selected === 'NFC'
        ? selected
        : (NFL_TEAMS[selected]?.fullName ?? selected);

  return (
    <Select
      value={selected}
      onValueChange={(v) => onChange(v)}
      disablePreventBodyScroll
    >
      <Select.Trigger
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
            {TEAM_OPTIONS.map((opt, i) => (
              <Select.Item
                key={opt.value}
                index={i + CONFERENCE_OPTIONS.length + 1}
                value={opt.value}
                backgroundColor={SURFACE_PANEL}
                hoverStyle={{ backgroundColor: SURFACE_CARD }}
              >
                <Select.ItemText color={TEXT_MUTED} fontSize={13}>
                  {opt.label}
                </Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={14} color={TEXT_PRIMARY} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Group>
        </Select.Viewport>
        <Select.ScrollDownButton />
      </Select.Content>
    </Select>
  );
}

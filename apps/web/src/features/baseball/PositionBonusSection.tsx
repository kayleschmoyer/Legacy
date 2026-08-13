import React, { useMemo, useState } from 'react';
import {
  Button,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { Plus } from '@tamagui/lucide-icons/icons/Plus';
import { Trash2 } from '@tamagui/lucide-icons/icons/Trash2';
import { Input, Text } from 'tamagui';
import { DefensiveFormat } from '@legacy-sports/graphql';
import {
  formatMultiplier,
  IDP_BONUS_POSITIONS,
  OFFENSE_BONUS_POSITIONS,
  parseInput,
  type PositionBonus,
  positionBonusKey,
  validatePositionBonus,
} from '@legacy-sports/scoring';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

/**
 * Stat definitions eligible for a position bonus — a subset of `ProfileStat`.
 * `group` is untyped (matches `ProfileStat.group: string`) since this field
 * is only carried through, never read, by this component.
 */
export interface BonusEligibleStat {
  id: number;
  group: string;
  displayName: string;
}

interface PositionBonusSectionProps {
  isLocked: boolean;
  defensiveFormat?: DefensiveFormat | null;
  availableStats: readonly BonusEligibleStat[];
}

interface DraftBonus {
  key: string;
  position: string;
  statDefinitionId: number | null;
  value: string;
}

let draftIdCounter = 0;
function nextDraftKey(): string {
  draftIdCounter += 1;
  return `draft-${draftIdCounter}`;
}

/**
 * Commissioner UI for position-scoped scoring bonuses (LS-9105). Additive on
 * top of the league's base stat multiplier — e.g. a TE-specific reception
 * bonus, or custom per-stat IDP point values.
 *
 * ⚠️ Persistence is not yet wired: `updateLeagueScoringPositionBonuses` and
 * `ScoringConfig.positionBonuses` are tracked separately in LS-9104 (blocked
 * at the time this component was built). Rows edited here are local-only
 * until that GraphQL API lands — see the inline notice below the row list.
 * The row/edit/validate mechanics mirror the flat-multiplier editor above so
 * wiring a real data source and mutation is a follow-up, not a rewrite.
 */
export function PositionBonusSection(
  props: PositionBonusSectionProps,
): React.JSX.Element {
  const { isLocked, defensiveFormat, availableStats } = props;

  const positions = useMemo(() => {
    return defensiveFormat === DefensiveFormat.Idp
      ? [...OFFENSE_BONUS_POSITIONS, ...IDP_BONUS_POSITIONS]
      : OFFENSE_BONUS_POSITIONS;
  }, [defensiveFormat]);

  const statOptions = useMemo(
    () =>
      [...availableStats].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    [availableStats],
  );

  const [bonuses, setBonuses] = useState<PositionBonus[]>([]);
  const [draft, setDraft] = useState<DraftBonus | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const statById = useMemo(() => {
    const map = new Map<number, BonusEligibleStat>();
    for (const stat of statOptions) {
      map.set(stat.id, stat);
    }
    return map;
  }, [statOptions]);

  const startDraft = () => {
    if (statOptions.length === 0 || positions.length === 0) {
      return;
    }
    setDraft({
      key: nextDraftKey(),
      position: positions[0],
      statDefinitionId: statOptions[0].id,
      value: formatMultiplier(0),
    });
  };

  const cancelDraft = () => {
    if (draft) {
      const key = draft.key;
      setErrors((prev) => {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
    }
    setDraft(null);
  };

  const commitDraft = () => {
    if (!draft || draft.statDefinitionId === null) {
      return;
    }

    const parsed = parseInput(draft.value);
    if (parsed === null) {
      setErrors((prev) => ({ ...prev, [draft.key]: 'Enter a bonus value' }));
      return;
    }

    const stat = statById.get(draft.statDefinitionId);
    if (!stat) {
      return;
    }

    const rowKey = positionBonusKey(draft.position, draft.statDefinitionId);
    const isDuplicate = bonuses.some(
      (b) => positionBonusKey(b.position, b.statDefinitionId) === rowKey,
    );
    if (isDuplicate) {
      setErrors((prev) => ({
        ...prev,
        [draft.key]: `A bonus for ${draft.position} / ${stat.displayName} already exists`,
      }));
      return;
    }

    setBonuses((prev) => [
      ...prev,
      {
        id: null,
        position: draft.position,
        statDefinitionId: stat.id,
        statDisplayName: stat.displayName,
        bonusMultiplier: parsed,
        defaultBonusMultiplier: 0,
      },
    ]);
    setDraft(null);
    const key = draft.key;
    setErrors((prev) => {
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const removeBonus = (position: string, statDefinitionId: number) => {
    const rowKey = positionBonusKey(position, statDefinitionId);
    setBonuses((prev) =>
      prev.filter(
        (b) => positionBonusKey(b.position, b.statDefinitionId) !== rowKey,
      ),
    );
  };

  const updateBonusValue = (
    position: string,
    statDefinitionId: number,
    value: string,
  ) => {
    const rowKey = positionBonusKey(position, statDefinitionId);
    const error = validatePositionBonus(value);
    setErrors((prev) => ({ ...prev, [rowKey]: error }));

    if (error) {
      return;
    }

    const parsed = parseInput(value);
    if (parsed === null) {
      return;
    }

    setBonuses((prev) =>
      prev.map((b) =>
        positionBonusKey(b.position, b.statDefinitionId) === rowKey
          ? { ...b, bonusMultiplier: parsed }
          : b,
      ),
    );
  };

  return (
    <YStack
      data-testid="position-bonus-section"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
      style={{
        background: `linear-gradient(180deg, ${withAlpha(BRAND_GOLD_LIGHT, 0.14)} 0%, transparent 40%)`,
      }}
    >
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        alignItems="center"
        justifyContent="space-between"
      >
        <YStack flex={1}>
          <Text fontSize="$4" fontWeight="700" color="$color12">
            Position Bonuses
          </Text>
          <Text fontSize="$2" color="$gray9">
            Extra points for a specific position on a stat, on top of the base
            multiplier above.
          </Text>
        </YStack>
        <Button
          size="$2"
          backgroundColor="transparent"
          borderColor={BRAND_GOLD_LIGHT}
          borderWidth={1}
          color={BRAND_GOLD_LIGHT}
          borderRadius="$4"
          onPress={startDraft}
          disabled={isLocked || statOptions.length === 0 || draft !== null}
          opacity={isLocked || statOptions.length === 0 ? 0.5 : 1}
          icon={<Plus size={14} />}
          aria-label="Add position bonus"
        >
          Add Bonus
        </Button>
      </XStack>

      <Separator borderColor="$surfacePanelBorder" />

      <YStack padding="$3" gap="$2">
        {bonuses.length === 0 && !draft ? (
          <Text fontSize="$2" color="$gray9" paddingVertical="$2">
            No position bonuses configured yet.
          </Text>
        ) : null}

        {bonuses.map((bonus) => {
          const rowKey = positionBonusKey(
            bonus.position,
            bonus.statDefinitionId,
          );
          const errorMessage = errors[rowKey];
          return (
            <XStack
              key={rowKey}
              data-testid="position-bonus-row"
              alignItems="center"
              gap="$2"
              paddingVertical="$1.5"
            >
              <XStack
                paddingHorizontal="$2"
                paddingVertical={2}
                borderRadius="$3"
                backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                minWidth={40}
                justifyContent="center"
              >
                <Text fontSize={11} fontWeight="700" color="$color12">
                  {bonus.position}
                </Text>
              </XStack>
              <Text fontSize="$3" color="$color12" flex={1} numberOfLines={1}>
                {bonus.statDisplayName}
              </Text>
              <Input
                value={formatMultiplier(bonus.bonusMultiplier)}
                onChangeText={(text: string) =>
                  updateBonusValue(bonus.position, bonus.statDefinitionId, text)
                }
                keyboardType="decimal-pad"
                inputMode="decimal"
                disabled={isLocked}
                width={72}
                textAlign="right"
                fontSize="$3"
                fontWeight="600"
                borderColor={errorMessage ? '$red8' : '$gray5'}
                borderWidth={1.5}
                borderRadius="$3"
                aria-label={`${bonus.position} ${bonus.statDisplayName} bonus value`}
              />
              <Button
                size="$2"
                backgroundColor="transparent"
                borderColor="$gray5"
                borderWidth={1}
                color="$gray10"
                borderRadius="$3"
                disabled={isLocked}
                onPress={() =>
                  removeBonus(bonus.position, bonus.statDefinitionId)
                }
                aria-label={`Remove ${bonus.position} ${bonus.statDisplayName} bonus`}
              >
                <Trash2 size={12} />
              </Button>
              {errorMessage ? (
                <Text fontSize={11} color="$red10">
                  {errorMessage}
                </Text>
              ) : null}
            </XStack>
          );
        })}

        {draft ? (
          <XStack
            data-testid="position-bonus-draft-row"
            alignItems="center"
            gap="$2"
            paddingVertical="$1.5"
          >
            <select
              aria-label="New bonus position"
              value={draft.position}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, position: e.target.value } : prev,
                )
              }
            >
              {positions.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>
            <select
              aria-label="New bonus stat"
              value={draft.statDefinitionId ?? ''}
              onChange={(e) =>
                setDraft((prev) =>
                  prev
                    ? { ...prev, statDefinitionId: Number(e.target.value) }
                    : prev,
                )
              }
            >
              {statOptions.map((stat) => (
                <option key={stat.id} value={stat.id}>
                  {stat.displayName}
                </option>
              ))}
            </select>
            <Input
              value={draft.value}
              onChangeText={(text: string) =>
                setDraft((prev) => (prev ? { ...prev, value: text } : prev))
              }
              keyboardType="decimal-pad"
              inputMode="decimal"
              width={72}
              textAlign="right"
              fontSize="$3"
              fontWeight="600"
              borderColor="$gray5"
              borderWidth={1.5}
              borderRadius="$3"
              aria-label="New bonus value"
            />
            <Button
              size="$2"
              backgroundColor={BRAND_NAVY_LIGHT}
              color="white"
              borderRadius="$3"
              onPress={commitDraft}
              aria-label="Confirm new position bonus"
            >
              Add
            </Button>
            <Button
              size="$2"
              backgroundColor="transparent"
              borderColor="$gray5"
              borderWidth={1}
              color="$gray10"
              borderRadius="$3"
              onPress={cancelDraft}
              aria-label="Cancel new position bonus"
            >
              Cancel
            </Button>
            {errors[draft.key] ? (
              <Text fontSize={11} color="$red10">
                {errors[draft.key]}
              </Text>
            ) : null}
          </XStack>
        ) : null}

        <Text fontSize={11} color="$gray8" paddingTop="$1">
          Position bonuses save automatically with the rest of this league's
          scoring settings once the position-bonus API ships (LS-9104) — for
          now, changes made here are local to this page.
        </Text>
      </YStack>
    </YStack>
  );
}

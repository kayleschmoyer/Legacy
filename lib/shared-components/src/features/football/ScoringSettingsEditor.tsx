/**
 * ScoringSettingsEditor — Football scoring settings UI (LS-257 / LS-4158).
 *
 * Renders all football scoring sections: Passing, Rushing, Receiving, Kicking,
 * and either DST (pts_allowed bands + flat stats) or IDP (individual defensive
 * multipliers) depending on defensiveFormat.
 *
 * Includes a quick-select preset row for Standard / Half-PPR / PPR (LS-4158).
 */
import React, { useCallback, useState } from 'react';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

// Default scoring values mirror lib/scoring/src/football/DefaultScoring.ts (LS-254).
// Inlined to avoid adding @legacy-sports/scoring as a shared-components dep.
const DEFAULTS = {
  passing: { yds: 0.04, td: 4, int: -2 },
  rushing: { yds: 0.1, td: 6, fumbles: -2 },
  receiving: { rec: 1, yds: 0.1, td: 6 },
  kicking: { fgm: 3, fg_50m: 5, xpm: 1 },
  defense: { sacks: 1, int: 2, fumbles_rec: 2, def_td: 6, safeties: 2 },
  pts_allowed: {
    pts_0: 10,
    pts_1_6: 7,
    pts_7_13: 4,
    pts_14_17: 1,
    pts_18_27: 0,
    pts_28_34: -1,
    pts_35_plus: -4,
  },
  idp: {
    solo_tkl: 1,
    ast_tkl: 0.5,
    sacks: 2,
    int: 3,
    pd: 1,
    ff: 2,
    fr: 2,
    def_td: 6,
    safeties: 2,
  },
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export type FootballScoringFormat = 'standard' | 'half_ppr' | 'ppr' | 'custom';
export type FootballDefensiveFormat = 'dst' | 'idp';

export interface FootballScoringValues {
  // Passing
  passing_yds: number;
  passing_td: number;
  passing_int: number;
  // Rushing
  rushing_yds: number;
  rushing_td: number;
  fumble_lost: number;
  // Receiving
  receiving_rec: number;
  receiving_yds: number;
  receiving_td: number;
  // Kicking
  fg_0_39: number;
  fg_40_49: number;
  fg_50_plus: number;
  xp_made: number;
  fg_missed: number;
  // DST flat stats
  dst_sack: number;
  dst_int: number;
  dst_fum_rec: number;
  dst_def_td: number;
  dst_safety: number;
  // DST pts_allowed bands
  pts_0: number;
  pts_1_6: number;
  pts_7_13: number;
  pts_14_17: number;
  pts_18_27: number;
  pts_28_34: number;
  pts_35_plus: number;
  // IDP
  idp_solo_tkl: number;
  idp_ast_tkl: number;
  idp_sacks: number;
  idp_int: number;
  idp_pd: number;
  idp_ff: number;
  idp_fr: number;
  idp_def_td: number;
  idp_safeties: number;
}

export function defaultFootballScoringValues(
  format: FootballScoringFormat = 'ppr',
): FootballScoringValues {
  const rec =
    format === 'standard'
      ? 0
      : format === 'half_ppr'
        ? 0.5
        : DEFAULTS.receiving.rec;
  return {
    passing_yds: DEFAULTS.passing.yds,
    passing_td: DEFAULTS.passing.td,
    passing_int: DEFAULTS.passing.int,
    rushing_yds: DEFAULTS.rushing.yds,
    rushing_td: DEFAULTS.rushing.td,
    fumble_lost: DEFAULTS.rushing.fumbles,
    receiving_rec: rec,
    receiving_yds: DEFAULTS.receiving.yds,
    receiving_td: DEFAULTS.receiving.td,
    fg_0_39: DEFAULTS.kicking.fgm,
    fg_40_49: DEFAULTS.kicking.fgm + 1,
    fg_50_plus: DEFAULTS.kicking.fg_50m,
    xp_made: DEFAULTS.kicking.xpm,
    fg_missed: -1,
    dst_sack: DEFAULTS.defense.sacks,
    dst_int: DEFAULTS.defense.int,
    dst_fum_rec: DEFAULTS.defense.fumbles_rec,
    dst_def_td: DEFAULTS.defense.def_td,
    dst_safety: DEFAULTS.defense.safeties,
    pts_0: DEFAULTS.pts_allowed.pts_0,
    pts_1_6: DEFAULTS.pts_allowed.pts_1_6,
    pts_7_13: DEFAULTS.pts_allowed.pts_7_13,
    pts_14_17: DEFAULTS.pts_allowed.pts_14_17,
    pts_18_27: DEFAULTS.pts_allowed.pts_18_27,
    pts_28_34: DEFAULTS.pts_allowed.pts_28_34,
    pts_35_plus: DEFAULTS.pts_allowed.pts_35_plus,
    idp_solo_tkl: DEFAULTS.idp.solo_tkl,
    idp_ast_tkl: DEFAULTS.idp.ast_tkl,
    idp_sacks: DEFAULTS.idp.sacks,
    idp_int: DEFAULTS.idp.int,
    idp_pd: DEFAULTS.idp.pd,
    idp_ff: DEFAULTS.idp.ff,
    idp_fr: DEFAULTS.idp.fr,
    idp_def_td: DEFAULTS.idp.def_td,
    idp_safeties: DEFAULTS.idp.safeties,
  };
}

// ── Preset definitions ───────────────────────────────────────────────────────

const PRESETS: ReadonlyArray<{
  id: FootballScoringFormat;
  label: string;
  rec: number;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    rec: 0,
    description: 'No reception bonus',
  },
  { id: 'half_ppr', label: 'Half-PPR', rec: 0.5, description: '0.5 pts / rec' },
  { id: 'ppr', label: 'PPR', rec: 1, description: '1 pt / rec' },
];

function detectPreset(rec: number): FootballScoringFormat {
  if (rec === 0) return 'standard';
  if (rec === 0.5) return 'half_ppr';
  if (rec === 1) return 'ppr';
  return 'custom';
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface StatRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: number;
}

function StatRow({
  label,
  value,
  onChange,
  disabled,
  step = 0.5,
}: StatRowProps): React.JSX.Element {
  const [raw, setRaw] = useState(String(value));

  const commit = useCallback(() => {
    const n = parseFloat(raw);
    if (!isNaN(n)) {
      onChange(n);
    } else {
      setRaw(String(value));
    }
  }, [raw, value, onChange]);

  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      paddingVertical="$2"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      borderStyle="dashed"
    >
      <Text fontFamily="$body" fontSize={13} color="$color11" flex={1}>
        {label}
      </Text>
      <XStack alignItems="center" gap="$2">
        <Button
          size="$2"
          width={28}
          height={28}
          borderRadius="$2"
          onPress={() => {
            const next = Math.round((value - step) * 10) / 10;
            onChange(next);
            setRaw(String(next));
          }}
          disabled={disabled}
          backgroundColor="$color3"
          borderColor="$borderColor"
          borderWidth={1}
          padding={0}
        >
          <Text color="$color11" fontSize={16}>
            −
          </Text>
        </Button>
        <Input
          size="$2"
          value={raw}
          onChangeText={setRaw}
          onBlur={commit}
          keyboardType="decimal-pad"
          disabled={disabled}
          textAlign="center"
          width={64}
          fontFamily="$mono"
          backgroundColor="$background"
          borderColor="$borderColor"
        />
        <Button
          size="$2"
          width={28}
          height={28}
          borderRadius="$2"
          onPress={() => {
            const next = Math.round((value + step) * 10) / 10;
            onChange(next);
            setRaw(String(next));
          }}
          disabled={disabled}
          backgroundColor="$color3"
          borderColor="$borderColor"
          borderWidth={1}
          padding={0}
        >
          <Text color="$color11" fontSize={16}>
            +
          </Text>
        </Button>
      </XStack>
    </XStack>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps): React.JSX.Element {
  return (
    <YStack gap="$1">
      <Text
        fontFamily="$display"
        fontWeight="700"
        fontSize={11}
        letterSpacing={1.4}
        textTransform="uppercase"
        color="$brandGoldLight"
        marginBottom="$1"
      >
        {title}
      </Text>
      {children}
    </YStack>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export interface ScoringSettingsEditorProps {
  values: FootballScoringValues;
  onChange: (next: FootballScoringValues) => void;
  defensiveFormat: FootballDefensiveFormat;
  disabled?: boolean;
  /** Show the preset quick-select row (default true). */
  showPresets?: boolean;
}

export function ScoringSettingsEditor({
  values,
  onChange,
  defensiveFormat,
  disabled = false,
  showPresets = true,
}: ScoringSettingsEditorProps): React.JSX.Element {
  const isDst = defensiveFormat === 'dst';
  const activePreset = detectPreset(values.receiving_rec);

  const set = useCallback(
    (field: keyof FootballScoringValues, v: number) => {
      onChange({ ...values, [field]: v });
    },
    [values, onChange],
  );

  const applyPreset = useCallback(
    (preset: Exclude<FootballScoringFormat, 'custom'>) => {
      const rec = preset === 'standard' ? 0 : preset === 'half_ppr' ? 0.5 : 1;
      onChange({ ...values, receiving_rec: rec });
    },
    [values, onChange],
  );

  return (
    <YStack gap="$5">
      {/* ── Offensive preset quick-select ── */}
      {showPresets && (
        <YStack gap="$2">
          <Text
            fontFamily="$display"
            fontWeight="700"
            fontSize={11}
            letterSpacing={1.4}
            textTransform="uppercase"
            color="$color11"
          >
            Offensive Format
          </Text>
          <XStack gap="$2">
            {PRESETS.map((p) => {
              const selected = activePreset === p.id;
              return (
                <Button
                  key={p.id}
                  flex={1}
                  disabled={disabled}
                  onPress={() =>
                    applyPreset(
                      p.id as Exclude<FootballScoringFormat, 'custom'>,
                    )
                  }
                  testID={`preset-${p.id}`}
                  backgroundColor={
                    selected ? 'rgba(52,211,153,0.14)' : '#0A0F1A'
                  }
                  borderColor={selected ? '#34D399' : '#2F3B53'}
                  borderWidth={selected ? 2 : 1}
                  borderRadius={8}
                  paddingVertical="$2"
                  paddingHorizontal="$3"
                  pressStyle={{ opacity: 0.8 }}
                >
                  <YStack alignItems="center" gap="$1">
                    <Text
                      fontFamily='"Big Shoulders Display", system-ui, sans-serif'
                      fontWeight="800"
                      fontSize={15}
                      color={selected ? '#34D399' : '#F8FAFC'}
                    >
                      {p.label}
                    </Text>
                    <Text
                      fontFamily='"Literata", Georgia, serif'
                      fontSize={11}
                      color="#9CAAC5"
                    >
                      {p.description}
                    </Text>
                  </YStack>
                </Button>
              );
            })}
            {activePreset === 'custom' && (
              <Button
                flex={1}
                disabled
                backgroundColor="rgba(197,165,90,0.08)"
                borderColor="#C5A55A"
                borderWidth={2}
                borderRadius={8}
                paddingVertical="$2"
                paddingHorizontal="$3"
              >
                <YStack alignItems="center" gap="$1">
                  <Text
                    fontFamily='"Big Shoulders Display", system-ui, sans-serif'
                    fontWeight="800"
                    fontSize={15}
                    color="#C5A55A"
                  >
                    Custom
                  </Text>
                  <Text
                    fontFamily='"Literata", Georgia, serif'
                    fontSize={11}
                    color="#9CAAC5"
                  >
                    Modified
                  </Text>
                </YStack>
              </Button>
            )}
          </XStack>
        </YStack>
      )}

      {/* ── Passing ── */}
      <Section title="Passing">
        <StatRow
          label="Passing Yards (per yard)"
          value={values.passing_yds}
          onChange={(v) => set('passing_yds', v)}
          disabled={disabled}
          step={0.01}
        />
        <StatRow
          label="Passing TD"
          value={values.passing_td}
          onChange={(v) => set('passing_td', v)}
          disabled={disabled}
          step={1}
        />
        <StatRow
          label="Interception"
          value={values.passing_int}
          onChange={(v) => set('passing_int', v)}
          disabled={disabled}
          step={0.5}
        />
      </Section>

      {/* ── Rushing ── */}
      <Section title="Rushing">
        <StatRow
          label="Rushing Yards (per yard)"
          value={values.rushing_yds}
          onChange={(v) => set('rushing_yds', v)}
          disabled={disabled}
          step={0.01}
        />
        <StatRow
          label="Rushing TD"
          value={values.rushing_td}
          onChange={(v) => set('rushing_td', v)}
          disabled={disabled}
          step={1}
        />
        <StatRow
          label="Fumble Lost"
          value={values.fumble_lost}
          onChange={(v) => set('fumble_lost', v)}
          disabled={disabled}
          step={0.5}
        />
      </Section>

      {/* ── Receiving ── */}
      <Section title="Receiving">
        <StatRow
          label="Receptions (PPR)"
          value={values.receiving_rec}
          onChange={(v) => set('receiving_rec', v)}
          disabled={disabled}
          step={0.5}
        />
        <StatRow
          label="Receiving Yards (per yard)"
          value={values.receiving_yds}
          onChange={(v) => set('receiving_yds', v)}
          disabled={disabled}
          step={0.01}
        />
        <StatRow
          label="Receiving TD"
          value={values.receiving_td}
          onChange={(v) => set('receiving_td', v)}
          disabled={disabled}
          step={1}
        />
      </Section>

      {/* ── Kicking ── */}
      <Section title="Kicking">
        <StatRow
          label="FG Made (0–39 yds)"
          value={values.fg_0_39}
          onChange={(v) => set('fg_0_39', v)}
          disabled={disabled}
          step={1}
        />
        <StatRow
          label="FG Made (40–49 yds)"
          value={values.fg_40_49}
          onChange={(v) => set('fg_40_49', v)}
          disabled={disabled}
          step={1}
        />
        <StatRow
          label="FG Made (50+ yds)"
          value={values.fg_50_plus}
          onChange={(v) => set('fg_50_plus', v)}
          disabled={disabled}
          step={1}
        />
        <StatRow
          label="Extra Point Made"
          value={values.xp_made}
          onChange={(v) => set('xp_made', v)}
          disabled={disabled}
          step={1}
        />
        <StatRow
          label="FG Missed"
          value={values.fg_missed}
          onChange={(v) => set('fg_missed', v)}
          disabled={disabled}
          step={0.5}
        />
      </Section>

      {/* ── DST (team defense) ── */}
      {isDst && (
        <>
          <Section title="D/ST — Flat Stats">
            <StatRow
              label="Sack"
              value={values.dst_sack}
              onChange={(v) => set('dst_sack', v)}
              disabled={disabled}
              step={0.5}
            />
            <StatRow
              label="Interception"
              value={values.dst_int}
              onChange={(v) => set('dst_int', v)}
              disabled={disabled}
              step={0.5}
            />
            <StatRow
              label="Fumble Recovery"
              value={values.dst_fum_rec}
              onChange={(v) => set('dst_fum_rec', v)}
              disabled={disabled}
              step={0.5}
            />
            <StatRow
              label="Defensive TD"
              value={values.dst_def_td}
              onChange={(v) => set('dst_def_td', v)}
              disabled={disabled}
              step={1}
            />
            <StatRow
              label="Safety"
              value={values.dst_safety}
              onChange={(v) => set('dst_safety', v)}
              disabled={disabled}
              step={0.5}
            />
          </Section>
          <Section title="D/ST — Points Allowed Bands">
            <StatRow
              label="0 pts allowed"
              value={values.pts_0}
              onChange={(v) => set('pts_0', v)}
              disabled={disabled}
              step={1}
            />
            <StatRow
              label="1–6 pts allowed"
              value={values.pts_1_6}
              onChange={(v) => set('pts_1_6', v)}
              disabled={disabled}
              step={1}
            />
            <StatRow
              label="7–13 pts allowed"
              value={values.pts_7_13}
              onChange={(v) => set('pts_7_13', v)}
              disabled={disabled}
              step={1}
            />
            <StatRow
              label="14–17 pts allowed"
              value={values.pts_14_17}
              onChange={(v) => set('pts_14_17', v)}
              disabled={disabled}
              step={1}
            />
            <StatRow
              label="18–27 pts allowed"
              value={values.pts_18_27}
              onChange={(v) => set('pts_18_27', v)}
              disabled={disabled}
              step={1}
            />
            <StatRow
              label="28–34 pts allowed"
              value={values.pts_28_34}
              onChange={(v) => set('pts_28_34', v)}
              disabled={disabled}
              step={1}
            />
            <StatRow
              label="35+ pts allowed"
              value={values.pts_35_plus}
              onChange={(v) => set('pts_35_plus', v)}
              disabled={disabled}
              step={1}
            />
          </Section>
        </>
      )}

      {/* ── IDP (individual defensive players) ── */}
      {!isDst && (
        <Section title="Individual Defensive Players (IDP)">
          <StatRow
            label="Solo Tackle"
            value={values.idp_solo_tkl}
            onChange={(v) => set('idp_solo_tkl', v)}
            disabled={disabled}
            step={0.5}
          />
          <StatRow
            label="Assist Tackle"
            value={values.idp_ast_tkl}
            onChange={(v) => set('idp_ast_tkl', v)}
            disabled={disabled}
            step={0.5}
          />
          <StatRow
            label="Sack"
            value={values.idp_sacks}
            onChange={(v) => set('idp_sacks', v)}
            disabled={disabled}
            step={0.5}
          />
          <StatRow
            label="Interception"
            value={values.idp_int}
            onChange={(v) => set('idp_int', v)}
            disabled={disabled}
            step={0.5}
          />
          <StatRow
            label="Pass Defended"
            value={values.idp_pd}
            onChange={(v) => set('idp_pd', v)}
            disabled={disabled}
            step={0.5}
          />
          <StatRow
            label="Forced Fumble"
            value={values.idp_ff}
            onChange={(v) => set('idp_ff', v)}
            disabled={disabled}
            step={0.5}
          />
          <StatRow
            label="Fumble Recovery"
            value={values.idp_fr}
            onChange={(v) => set('idp_fr', v)}
            disabled={disabled}
            step={0.5}
          />
          <StatRow
            label="Defensive TD"
            value={values.idp_def_td}
            onChange={(v) => set('idp_def_td', v)}
            disabled={disabled}
            step={1}
          />
          <StatRow
            label="Safety"
            value={values.idp_safeties}
            onChange={(v) => set('idp_safeties', v)}
            disabled={disabled}
            step={0.5}
          />
        </Section>
      )}
    </YStack>
  );
}

import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from '../../platform-components';
import { BattingStatsData, BattingStatsTable } from './BattingStatsTable';
import { PitchingStatsData, PitchingStatsTable } from './PitchingStatsTable';
import { FieldingStatsTable } from './FieldingStatsTable';

// Generic interfaces to avoid GraphQL dependencies
interface Player {
  name?: string | null;
}

interface BattingStatsWithPlayer {
  player?: Player | null;
  ab?: number | null;
  h?: number | null;
  avg?: number | null;
  hr?: number | null;
  rbi?: number | null;
  r?: number | null;
  sb?: number | null;
  bb?: number | null;
  so?: number | null;
  obp?: number | null;
  slg?: number | null;
  ops?: number | null;
}

interface PitchingStatsWithPlayer {
  player?: Player | null;
  w?: number | null;
  l?: number | null;
  era?: number | null;
  g?: number | null;
  gs?: number | null;
  sv?: number | null;
  ip?: number | null;
  h?: number | null;
  er?: number | null;
  hr?: number | null;
  bb?: number | null;
  so?: number | null;
  whip?: number | null;
}

interface FieldingStatsWithPlayer {
  player?: Player | null;
  a?: number | null;
  cg?: number | null;
  chances?: number | null;
  cs?: number | null;
  dpDef?: number | null;
  eDef?: number | null;
  g?: number | null;
  gs?: number | null;
  innDef?: number | null;
  pickoffs?: number | null;
  po?: number | null;
  pos?: string | null;
  sb?: number | null;
  wp?: number | null;
}

// Props interfaces for each table component
export interface BattingStatsTableWithDataProps {
  data?: {
    nodes?: (BattingStatsWithPlayer | null | undefined)[];
  };
  loading?: boolean;
  error?: Error | null;
}

export interface PitchingStatsTableWithDataProps {
  data?: {
    nodes?: (PitchingStatsWithPlayer | null | undefined)[];
  };
  loading?: boolean;
  error?: Error | null;
}

export interface FieldingStatsTableWithDataProps {
  data?: {
    nodes?: (FieldingStatsWithPlayer | null | undefined)[];
  };
  loading?: boolean;
  error?: Error | null;
}

function BattingStatsTableWithData({ 
  data,
  loading,
  error,
 }: BattingStatsTableWithDataProps) {
  const stats = data?.nodes;

  const filteredStats = useMemo(
    () =>
      stats?.filter(
        (s): s is BattingStatsWithPlayer => s !== undefined && s !== null,
      ).map((stat): BattingStatsData => ({
        player: stat.player ? { name: stat.player.name || undefined } : undefined,
        ab: stat.ab || undefined,
        h: stat.h || undefined,
        hr: stat.hr || undefined,
        rbi: stat.rbi || undefined,
        r: stat.r || undefined,
        sb: stat.sb || undefined,
        bb: stat.bb || undefined,
        so: stat.so || undefined,
        // Add other fields as needed
      })) || [],
    [stats],
  );

  if (loading) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={{ color: '#FFFFFF', marginTop: 10 }}>
          Loading batting stats...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: '#FF6B6B' }}>
          Error loading batting stats: {error.message}
        </Text>
      </View>
    );
  }

  if (!filteredStats.length) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF' }}>Could not load batting stats</Text>
      </View>
    );
  }

  return <BattingStatsTable stats={filteredStats} />;
}

function PitchingStatsTableWithData({ 
  data,
  loading,
  error,
 }: PitchingStatsTableWithDataProps) {
  const stats = data?.nodes;

  const filteredStats = useMemo(
    () =>
      stats?.filter(
        (s): s is PitchingStatsWithPlayer => s !== undefined && s !== null,
      ).map((stat): PitchingStatsData => ({
        player: stat.player ? { name: stat.player.name || undefined } : undefined,
        w: stat.w || undefined,
        l: stat.l || undefined,
        era: stat.era || undefined,
        g: stat.g || undefined,
        gs: stat.gs || undefined,
        sv: stat.sv || undefined,
        ip: stat.ip || undefined,
        h: stat.h || undefined,
        er: stat.er || undefined,
        hr: stat.hr || undefined,
        bb: stat.bb || undefined,
        so: stat.so || undefined,
        // Add other fields as needed
      })) || [],
    [stats],
  );

  if (loading) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={{ color: '#FFFFFF', marginTop: 10 }}>
          Loading pitching stats...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: '#FF6B6B' }}>
          Error loading pitching stats: {error.message}
        </Text>
      </View>
    );
  }

  if (!filteredStats.length) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF' }}>Could not load pitching stats</Text>
      </View>
    );
  }

  return <PitchingStatsTable stats={filteredStats} />;
}

function FieldingStatsTableWithData({ 
  data,
  loading,
  error,
 }: FieldingStatsTableWithDataProps) {
  const stats = data?.nodes;

  const filteredStats = useMemo(
    () =>
      stats?.filter(
        (s): s is FieldingStatsWithPlayer => s !== undefined && s !== null,
      ) || [],
    [stats],
  );

  if (loading) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={{ color: '#FFFFFF', marginTop: 10 }}>
          Loading fielding stats...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: '#FF6B6B' }}>
          Error loading fielding stats: {error.message}
        </Text>
      </View>
    );
  }

  if (!filteredStats.length) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF' }}>Could not load fielding stats</Text>
      </View>
    );
  }

  return <FieldingStatsTable stats={filteredStats} />;
}

export { BattingStatsTableWithData };
export { PitchingStatsTableWithData };
export { FieldingStatsTableWithData };

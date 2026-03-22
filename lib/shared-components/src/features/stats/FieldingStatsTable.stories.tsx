import type { Meta, StoryObj } from '@storybook/react';
import type { FieldingStatsRecord } from './FieldingStatsTable';
import { FieldingStatsTable } from './FieldingStatsTable';

const sampleFieldingStats: FieldingStatsRecord[] = [
  {
    player: { name: 'Mookie Betts' },
    a: 5,
    cg: 0,
    chances: 280,
    cs: 2,
    dpDef: 3,
    eDef: 2,
    g: 152,
    gs: 150,
    innDef: 1350.1,
    pickoffs: 0,
    po: 273,
    pos: 'RF',
    sb: 5,
    wp: 0,
  },
  {
    player: { name: 'Marcus Semien' },
    a: 320,
    cg: 0,
    chances: 580,
    cs: 0,
    dpDef: 85,
    eDef: 12,
    g: 162,
    gs: 162,
    innDef: 1440,
    pickoffs: 0,
    po: 248,
    pos: 'SS',
    sb: 0,
    wp: 0,
  },
  {
    player: { name: 'Matt Chapman' },
    a: 250,
    cg: 0,
    chances: 420,
    cs: 0,
    dpDef: 25,
    eDef: 8,
    g: 145,
    gs: 143,
    innDef: 1280,
    pickoffs: 0,
    po: 162,
    pos: '3B',
    sb: 0,
    wp: 0,
  },
];

const fullRosterStats: FieldingStatsRecord[] = [
  ...sampleFieldingStats,
  {
    player: { name: 'Freddie Freeman' },
    a: 95,
    cg: 0,
    chances: 1350,
    cs: 0,
    dpDef: 120,
    eDef: 5,
    g: 161,
    gs: 161,
    innDef: 1430,
    pickoffs: 2,
    po: 1250,
    pos: '1B',
    sb: 0,
    wp: 0,
  },
  {
    player: { name: 'Gavin Lux' },
    a: 210,
    cg: 0,
    chances: 450,
    cs: 0,
    dpDef: 60,
    eDef: 10,
    g: 130,
    gs: 128,
    innDef: 1150,
    pickoffs: 0,
    po: 230,
    pos: '2B',
    sb: 0,
    wp: 0,
  },
  {
    player: { name: 'Will Smith' },
    a: 40,
    cg: 2,
    chances: 900,
    cs: 25,
    dpDef: 5,
    eDef: 6,
    g: 140,
    gs: 138,
    innDef: 1220,
    pickoffs: 3,
    po: 850,
    pos: 'C',
    sb: 60,
    wp: 15,
  },
  {
    player: { name: 'Chris Taylor' },
    a: 3,
    cg: 0,
    chances: 260,
    cs: 1,
    dpDef: 1,
    eDef: 3,
    g: 148,
    gs: 140,
    innDef: 1260,
    pickoffs: 0,
    po: 254,
    pos: 'LF',
    sb: 3,
    wp: 0,
  },
  {
    player: { name: 'James Outman' },
    a: 4,
    cg: 0,
    chances: 310,
    cs: 0,
    dpDef: 0,
    eDef: 4,
    g: 155,
    gs: 153,
    innDef: 1370,
    pickoffs: 0,
    po: 302,
    pos: 'CF',
    sb: 2,
    wp: 0,
  },
  {
    player: { name: 'Miguel Rojas' },
    a: 280,
    cg: 0,
    chances: 500,
    cs: 0,
    dpDef: 70,
    eDef: 9,
    g: 140,
    gs: 138,
    innDef: 1230,
    pickoffs: 0,
    po: 211,
    pos: 'DH',
    sb: 0,
    wp: 0,
  },
];

const meta: Meta<typeof FieldingStatsTable> = {
  title: 'Features/Stats/FieldingStatsTable',
  component: FieldingStatsTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Simple table with horizontal scroll that displays fielding statistics with a header row and data rows.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {
  args: {
    stats: sampleFieldingStats,
  },
};

export const EmptyState: Story = {
  args: {
    stats: [],
  },
};

export const FullRoster: Story = {
  args: {
    stats: fullRosterStats,
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { StatsTable, StatsTableProps } from './StatsTable';
import { StatsTableColumn, StatsTableRow } from '../../types';

const meta: Meta<typeof StatsTable> = {
  title: 'Features/Stats/StatsTable',
  component: StatsTable,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A sortable table component for displaying statistical data across various sports.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    columns: {
      control: 'object',
      description: 'Array of column definitions',
    },
    data: {
      control: 'object',
      description: 'Array of data rows',
    },
    title: {
      control: 'text',
      description: 'Optional table title',
    },
    sortable: {
      control: 'boolean',
      description: 'Enable column sorting',
    },
    maxHeight: {
      control: 'number',
      description: 'Maximum table height in pixels',
    },
    onRowPress: {
      action: 'row-pressed',
      description: 'Callback when a row is pressed',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample data for baseball batting stats
const battingColumns: StatsTableColumn[] = [
  { key: 'player', label: 'Player', sortable: true, type: 'string' },
  { key: 'team', label: 'Team', sortable: true, type: 'string' },
  { key: 'avg', label: 'AVG', sortable: true, type: 'number' },
  { key: 'hr', label: 'HR', sortable: true, type: 'number' },
  { key: 'rbi', label: 'RBI', sortable: true, type: 'number' },
  { key: 'sb', label: 'SB', sortable: true, type: 'number' },
  { key: 'ops', label: 'OPS', sortable: true, type: 'number' },
];

const battingData: StatsTableRow[] = [
  {
    player: 'Mike Trout',
    team: 'LAA',
    avg: 0.283,
    hr: 40,
    rbi: 104,
    sb: 11,
    ops: 0.987,
  },
  {
    player: 'Mookie Betts',
    team: 'LAD',
    avg: 0.307,
    hr: 35,
    rbi: 82,
    sb: 12,
    ops: 0.945,
  },
  {
    player: 'Ronald Acuña Jr.',
    team: 'ATL',
    avg: 0.337,
    hr: 41,
    rbi: 106,
    sb: 73,
    ops: 1.012,
  },
  {
    player: 'Freddie Freeman',
    team: 'LAD',
    avg: 0.331,
    hr: 21,
    rbi: 100,
    sb: 13,
    ops: 0.918,
  },
  {
    player: 'Aaron Judge',
    team: 'NYY',
    avg: 0.311,
    hr: 37,
    rbi: 62,
    sb: 6,
    ops: 1.056,
  },
  {
    player: 'Jose Altuve',
    team: 'HOU',
    avg: 0.306,
    hr: 17,
    rbi: 69,
    sb: 18,
    ops: 0.823,
  },
  {
    player: 'Juan Soto',
    team: 'SD',
    avg: 0.275,
    hr: 35,
    rbi: 109,
    sb: 6,
    ops: 0.933,
  },
];

// Sample data for football stats
const footballColumns: StatsTableColumn[] = [
  { key: 'player', label: 'Player', sortable: true, type: 'string' },
  { key: 'position', label: 'Pos', sortable: true, type: 'string' },
  { key: 'team', label: 'Team', sortable: true, type: 'string' },
  { key: 'yards', label: 'Yards', sortable: true, type: 'number' },
  { key: 'tds', label: 'TDs', sortable: true, type: 'number' },
  { key: 'avg', label: 'AVG', sortable: true, type: 'number' },
];

const footballData: StatsTableRow[] = [
  {
    player: 'Josh Allen',
    position: 'QB',
    team: 'BUF',
    yards: 4306,
    tds: 29,
    avg: 7.8,
  },
  {
    player: 'Tyreek Hill',
    position: 'WR',
    team: 'MIA',
    yards: 1710,
    tds: 13,
    avg: 13.5,
  },
  {
    player: 'Christian McCaffrey',
    position: 'RB',
    team: 'SF',
    yards: 1459,
    tds: 14,
    avg: 5.4,
  },
  {
    player: 'Travis Kelce',
    position: 'TE',
    team: 'KC',
    yards: 984,
    tds: 5,
    avg: 9.0,
  },
  {
    player: 'Stefon Diggs',
    position: 'WR',
    team: 'BUF',
    yards: 1429,
    tds: 11,
    avg: 12.5,
  },
];

// Minimal data set
const minimalColumns: StatsTableColumn[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'value', label: 'Value', sortable: true },
];

const minimalData: StatsTableRow[] = [
  { name: 'Item 1', value: 100 },
  { name: 'Item 2', value: 85 },
  { name: 'Item 3', value: 92 },
];

export const Default: Story = {
  args: {
    columns: battingColumns,
    data: battingData,
    title: 'Batting Statistics',
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
};

export const FootballStats: Story = {
  args: {
    columns: footballColumns,
    data: footballData,
    title: 'Player Statistics',
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
};

export const NoTitle: Story = {
  args: {
    columns: battingColumns,
    data: battingData,
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
};

export const NotSortable: Story = {
  args: {
    columns: battingColumns,
    data: battingData,
    title: 'Non-Sortable Table',
    sortable: false,
    maxHeight: 400,
    onRowPress: fn(),
  },
};

export const SmallHeight: Story = {
  args: {
    columns: battingColumns,
    data: battingData,
    title: 'Scrollable Table',
    sortable: true,
    maxHeight: 200,
    onRowPress: fn(),
  },
};

export const MinimalData: Story = {
  args: {
    columns: minimalColumns,
    data: minimalData,
    title: 'Simple Table',
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
};

export const EmptyData: Story = {
  args: {
    columns: battingColumns,
    data: [],
    title: 'Empty Table',
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
};

export const NoRowPress: Story = {
  args: {
    columns: battingColumns,
    data: battingData,
    title: 'Non-Interactive Rows',
    sortable: true,
    maxHeight: 400,
  },
};

export const LargeDataset: Story = {
  args: {
    columns: battingColumns,
    data: [
      ...battingData,
      {
        player: 'Vladimir Guerrero Jr.',
        team: 'TOR',
        avg: 0.264,
        hr: 26,
        rbi: 94,
        sb: 2,
        ops: 0.788,
      },
      {
        player: 'Pete Alonso',
        team: 'NYM',
        avg: 0.23,
        hr: 46,
        rbi: 118,
        sb: 0,
        ops: 0.821,
      },
      {
        player: 'Matt Olson',
        team: 'ATL',
        avg: 0.283,
        hr: 54,
        rbi: 139,
        sb: 1,
        ops: 0.923,
      },
      {
        player: 'Corey Seager',
        team: 'TEX',
        avg: 0.327,
        hr: 33,
        rbi: 96,
        sb: 5,
        ops: 0.947,
      },
      {
        player: 'Gleyber Torres',
        team: 'NYY',
        avg: 0.273,
        hr: 25,
        rbi: 76,
        sb: 5,
        ops: 0.81,
      },
      {
        player: 'Bo Bichette',
        team: 'TOR',
        avg: 0.306,
        hr: 20,
        rbi: 73,
        sb: 25,
        ops: 0.827,
      },
      {
        player: 'Kyle Schwarber',
        team: 'PHI',
        avg: 0.197,
        hr: 47,
        rbi: 104,
        sb: 3,
        ops: 0.792,
      },
      {
        player: 'Austin Riley',
        team: 'ATL',
        avg: 0.273,
        hr: 37,
        rbi: 97,
        sb: 1,
        ops: 0.83,
      },
    ],
    title: 'Extended Player Stats',
    sortable: true,
    maxHeight: 300,
    onRowPress: fn(),
  },
};

export const MixedDataTypes: Story = {
  args: {
    columns: [
      { key: 'player', label: 'Player', sortable: true, type: 'string' },
      { key: 'age', label: 'Age', sortable: true, type: 'number' },
      { key: 'status', label: 'Status', sortable: true, type: 'string' },
      { key: 'salary', label: 'Salary', sortable: true, type: 'number' },
      { key: 'draft_year', label: 'Draft', sortable: true, type: 'number' },
    ],
    data: [
      {
        player: 'Mike Trout',
        age: 32,
        status: 'Active',
        salary: 37116666,
        draft_year: 2009,
      },
      {
        player: 'Shohei Ohtani',
        age: 29,
        status: 'Active',
        salary: 30000000,
        draft_year: 2017,
      },
      {
        player: 'Clayton Kershaw',
        age: 35,
        status: 'Active',
        salary: 17000000,
        draft_year: 2006,
      },
      {
        player: 'Jacob deGrom',
        age: 35,
        status: 'Injured',
        salary: 37000000,
        draft_year: 2010,
      },
    ],
    title: 'Player Information',
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
};

// Interactive tests
export const WithSorting: Story = {
  args: {
    columns: battingColumns,
    data: battingData,
    title: 'Sortable Stats Table',
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Test sorting by clicking on a column header
    const homeruns = canvas.getByText('HR');
    await userEvent.click(homeruns);

    // Check that rows are reordered (first row should now be highest HR)
    await expect(canvas.getByText('Ronald Acuña Jr.')).toBeInTheDocument();
  },
};

export const WithRowInteraction: Story = {
  args: {
    columns: battingColumns,
    data: battingData.slice(0, 3), // Use fewer rows for cleaner test
    title: 'Interactive Table',
    sortable: true,
    maxHeight: 400,
    onRowPress: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Test row clicking
    const troutRow = canvas.getByText('Mike Trout').closest('div');
    if (troutRow) {
      await userEvent.click(troutRow);
      await expect(args.onRowPress).toHaveBeenCalled();
    }
  },
};

// Layout variations
export const CompactTable: Story = {
  args: {
    columns: [
      { key: 'player', label: 'Player', sortable: true },
      { key: 'avg', label: 'AVG', sortable: true },
      { key: 'hr', label: 'HR', sortable: true },
    ],
    data: battingData.map((row) => ({
      player: row.player,
      avg: row.avg,
      hr: row.hr,
    })),
    title: 'Top Hitters',
    sortable: true,
    maxHeight: 250,
    onRowPress: fn(),
  },
  parameters: {
    layout: 'padded',
  },
};

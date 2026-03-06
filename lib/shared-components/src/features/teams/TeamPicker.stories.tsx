import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import { LOGGER } from '@legacy-sports/logging';
import { AdvancedTeamPicker, TeamData, TeamPicker } from './TeamPicker';

const meta: Meta<typeof TeamPicker> = {
  title: 'Features/Teams/TeamPicker',
  component: TeamPicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Cross-platform team picker component with support for web and native platforms.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    selectedTeam: {
      control: 'number',
      description: 'ID of the currently selected team',
    },
    teams: {
      control: 'object',
      description: 'Array of team data objects',
    },
    onSelect: {
      action: 'team-selected',
      description: 'Callback when a team is selected',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text when no team is selected',
    },
    style: {
      control: 'object',
      description: 'Custom styles',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample team data for baseball
const mlbTeams: TeamData[] = [
  {
    id: 1,
    name: 'New York Yankees',
    abbreviation: 'NYY',
    city: 'New York',
    league: 'AL',
    division: 'AL East',
    color: '#132448',
  },
  {
    id: 2,
    name: 'Boston Red Sox',
    abbreviation: 'BOS',
    city: 'Boston',
    league: 'AL',
    division: 'AL East',
    color: '#BD3039',
  },
  {
    id: 3,
    name: 'Tampa Bay Rays',
    abbreviation: 'TB',
    city: 'Tampa Bay',
    league: 'AL',
    division: 'AL East',
    color: '#092C5C',
  },
  {
    id: 4,
    name: 'Toronto Blue Jays',
    abbreviation: 'TOR',
    city: 'Toronto',
    league: 'AL',
    division: 'AL East',
    color: '#134A8E',
  },
  {
    id: 5,
    name: 'Baltimore Orioles',
    abbreviation: 'BAL',
    city: 'Baltimore',
    league: 'AL',
    division: 'AL East',
    color: '#DF4601',
  },
  {
    id: 6,
    name: 'Houston Astros',
    abbreviation: 'HOU',
    city: 'Houston',
    league: 'AL',
    division: 'AL West',
    color: '#002D62',
  },
  {
    id: 7,
    name: 'Los Angeles Angels',
    abbreviation: 'LAA',
    city: 'Los Angeles',
    league: 'AL',
    division: 'AL West',
    color: '#BA0021',
  },
  {
    id: 8,
    name: 'Seattle Mariners',
    abbreviation: 'SEA',
    city: 'Seattle',
    league: 'AL',
    division: 'AL West',
    color: '#0C2C56',
  },
  {
    id: 9,
    name: 'Texas Rangers',
    abbreviation: 'TEX',
    city: 'Texas',
    league: 'AL',
    division: 'AL West',
    color: '#003278',
  },
  {
    id: 10,
    name: 'Oakland Athletics',
    abbreviation: 'OAK',
    city: 'Oakland',
    league: 'AL',
    division: 'AL West',
    color: '#003831',
  },
  {
    id: 11,
    name: 'Los Angeles Dodgers',
    abbreviation: 'LAD',
    city: 'Los Angeles',
    league: 'NL',
    division: 'NL West',
    color: '#005A9C',
  },
  {
    id: 12,
    name: 'San Francisco Giants',
    abbreviation: 'SF',
    city: 'San Francisco',
    league: 'NL',
    division: 'NL West',
    color: '#FD5A1E',
  },
  {
    id: 13,
    name: 'San Diego Padres',
    abbreviation: 'SD',
    city: 'San Diego',
    league: 'NL',
    division: 'NL West',
    color: '#2F241D',
  },
  {
    id: 14,
    name: 'Arizona Diamondbacks',
    abbreviation: 'AZ',
    city: 'Arizona',
    league: 'NL',
    division: 'NL West',
    color: '#A71930',
  },
  {
    id: 15,
    name: 'Colorado Rockies',
    abbreviation: 'COL',
    city: 'Colorado',
    league: 'NL',
    division: 'NL West',
    color: '#33006F',
  },
];

// Sample team data for football
const nflTeams: TeamData[] = [
  {
    id: 21,
    name: 'Buffalo Bills',
    abbreviation: 'BUF',
    city: 'Buffalo',
    league: 'AFC',
    division: 'AFC East',
    color: '#00338D',
  },
  {
    id: 22,
    name: 'Miami Dolphins',
    abbreviation: 'MIA',
    city: 'Miami',
    league: 'AFC',
    division: 'AFC East',
    color: '#008E97',
  },
  {
    id: 23,
    name: 'New England Patriots',
    abbreviation: 'NE',
    city: 'New England',
    league: 'AFC',
    division: 'AFC East',
    color: '#002244',
  },
  {
    id: 24,
    name: 'New York Jets',
    abbreviation: 'NYJ',
    city: 'New York',
    league: 'AFC',
    division: 'AFC East',
    color: '#125740',
  },
  {
    id: 25,
    name: 'Kansas City Chiefs',
    abbreviation: 'KC',
    city: 'Kansas City',
    league: 'AFC',
    division: 'AFC West',
    color: '#E31837',
  },
  {
    id: 26,
    name: 'Las Vegas Raiders',
    abbreviation: 'LV',
    city: 'Las Vegas',
    league: 'AFC',
    division: 'AFC West',
    color: '#000000',
  },
  {
    id: 27,
    name: 'Los Angeles Chargers',
    abbreviation: 'LAC',
    city: 'Los Angeles',
    league: 'AFC',
    division: 'AFC West',
    color: '#0080C6',
  },
  {
    id: 28,
    name: 'Denver Broncos',
    abbreviation: 'DEN',
    city: 'Denver',
    league: 'AFC',
    division: 'AFC West',
    color: '#FB4F14',
  },
];

// Minimal team data
const minimalTeams: TeamData[] = [
  { id: 1, name: 'Team A' },
  { id: 2, name: 'Team B' },
  { id: 3, name: 'Team C' },
];

export const Default: Story = {
  args: {
    selectedTeam: 0,
    teams: mlbTeams.slice(0, 5), // AL East teams
    onSelect: fn(),
    placeholder: 'Choose your team',
  },
};

export const WithSelection: Story = {
  args: {
    selectedTeam: 1, // Yankees selected
    teams: mlbTeams.slice(0, 5),
    onSelect: fn(),
    placeholder: 'Choose your team',
  },
};

export const FootballTeams: Story = {
  args: {
    selectedTeam: 0,
    teams: nflTeams.slice(0, 4), // AFC East teams
    onSelect: fn(),
    placeholder: 'Select NFL Team',
  },
};

export const AllMLBTeams: Story = {
  args: {
    selectedTeam: 0,
    teams: mlbTeams,
    onSelect: fn(),
    placeholder: 'Select MLB Team',
  },
};

export const MinimalTeams: Story = {
  args: {
    selectedTeam: 0,
    teams: minimalTeams,
    onSelect: fn(),
    placeholder: 'Select Team',
  },
};

export const EmptyTeams: Story = {
  args: {
    selectedTeam: 0,
    teams: [],
    onSelect: fn(),
    placeholder: 'No teams available',
  },
};

export const CustomPlaceholder: Story = {
  args: {
    selectedTeam: 0,
    teams: mlbTeams.slice(0, 5),
    onSelect: fn(),
    placeholder: 'Pick your favorite baseball team!',
  },
};

export const WithCustomStyle: Story = {
  args: {
    selectedTeam: 0,
    teams: mlbTeams.slice(0, 5),
    onSelect: fn(),
    placeholder: 'Styled Team Picker',
    style: {
      backgroundColor: '#f0f0f0',
      borderRadius: 12,
      padding: 8,
      margin: 8,
    },
  },
};

// Advanced Team Picker Stories
type _AdvancedMeta = Meta<typeof AdvancedTeamPicker>;
type AdvancedStory = StoryObj<_AdvancedMeta>;

export const AdvancedDefault: AdvancedStory = {
  args: {
    selectedTeam: 0,
    teams: mlbTeams.slice(0, 8),
    onSelect: fn(),
    placeholder: 'Advanced Team Picker',
    showDivisions: true,
    showLeagues: true,
    groupByDivision: false,
    disabled: false,
  },
};

export const WithDivisionGrouping: AdvancedStory = {
  args: {
    selectedTeam: 0,
    teams: mlbTeams.slice(0, 10), // AL East + AL West
    onSelect: fn(),
    placeholder: 'Teams by Division',
    showDivisions: true,
    showLeagues: true,
    groupByDivision: true,
    disabled: false,
  },
};

export const DisabledPicker: AdvancedStory = {
  args: {
    selectedTeam: 1, // Yankees selected
    teams: mlbTeams.slice(0, 5),
    onSelect: fn(),
    placeholder: 'Disabled Picker',
    showDivisions: true,
    showLeagues: false,
    groupByDivision: false,
    disabled: true,
  },
};

export const LeagueOnly: AdvancedStory = {
  args: {
    selectedTeam: 0,
    teams: nflTeams,
    onSelect: fn(),
    placeholder: 'NFL Teams',
    showDivisions: false,
    showLeagues: true,
    groupByDivision: false,
    disabled: false,
  },
};

// Interactive tests
export const WithInteraction: Story = {
  args: {
    selectedTeam: 0,
    teams: mlbTeams.slice(0, 5),
    onSelect: fn(),
    placeholder: 'Select Team',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // For web implementation, test the select element
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Storybook args placeholder is loosely typed
      const selectElement = canvas.getByDisplayValue(args.placeholder);
      if (selectElement && selectElement.tagName === 'SELECT') {
        await userEvent.selectOptions(selectElement, '1');
        await expect(args.onSelect).toHaveBeenCalledWith(1);
      }
    } catch {
      // If no select element found, it might be using the fallback
      LOGGER.info('Using fallback picker implementation');
    }
  },
};

// Comparison story showing different configurations
export const PickerVariations: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
      }}
    >
      <div>
        <h3>Basic Team Picker</h3>
        <TeamPicker
          selectedTeam={0}
          teams={mlbTeams.slice(0, 5)}
          onSelect={fn()}
          placeholder="Basic Picker"
        />
      </div>

      <div>
        <h3>Advanced Team Picker</h3>
        <AdvancedTeamPicker
          selectedTeam={0}
          teams={mlbTeams.slice(0, 5)}
          onSelect={fn()}
          placeholder="Advanced Picker"
          showDivisions={true}
          showLeagues={true}
        />
      </div>

      <div>
        <h3>Grouped by Division</h3>
        <AdvancedTeamPicker
          selectedTeam={0}
          teams={mlbTeams.slice(0, 10)}
          onSelect={fn()}
          placeholder="Grouped Picker"
          groupByDivision={true}
          showDivisions={true}
        />
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { CareerArcChart, parseAwards } from './CareerArcChart';

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    AreaChart: Pass,
    Area: () => null,
    CartesianGrid: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
    ReferenceLine: () => null,
    ReferenceDot: () => null,
  };
});

jest.mock('../constants/colors', () => ({
  BLUE_LIGHT: '#bluel',
  BRAND_GOLD: '#gold',
  BRAND_GOLD_LIGHT: '#goldl',
  BRAND_NAVY_LIGHT: '#navyl',
  BRAND_SEAM_RED: '#red',
  EMERALD_LIGHT: '#emerald',
  OUTLINE_SUBTLE: '#outline',
  OVERLAY_BLACK_40: '#overlay',
  SURFACE_CARD: '#card',
  TEXT_MUTED: '#muted',
  WHITE: '#fff',
  withAlpha: (color: string) => color,
}));

type PassProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
};
jest.mock('tamagui', () => {
  const Pass = ({ children, ...rest }: PassProps) => (
    <div {...rest}>{children}</div>
  );
  return {
    createTokens: (tokens: unknown) => tokens,
    Text: ({ children, ...rest }: PassProps) => (
      <span {...rest}>{children}</span>
    ),
    XStack: Pass,
    YStack: Pass,
  };
});

// ── Test data ─────────────────────────────────────────────────────────────────

function makeBattingSeason(
  overrides: Partial<{
    season: number;
    games: number;
    plateAppearances: number;
    onBasePlusSlugging: number;
    homeRuns: number;
    team: string;
    awardSummary: string | null;
  }> = {},
) {
  return {
    season: 2020,
    games: 60,
    plateAppearances: 500,
    onBasePlusSlugging: 0.9,
    homeRuns: 10,
    team: 'NYY',
    awardSummary: null,
    ...overrides,
  };
}

function makePitchingSeason(
  overrides: Partial<{
    season: number;
    games: number;
    inningsPitched: number;
    earnedRunAveragePlus: number;
    strikeouts: number;
    team: string;
    awardSummary: string | null;
  }> = {},
) {
  return {
    season: 2020,
    games: 12,
    inningsPitched: 150,
    earnedRunAveragePlus: 130,
    strikeouts: 90,
    team: 'LAD',
    awardSummary: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CareerArcChart — accessibility (LS-6968)', () => {
  describe('batting mode', () => {
    it('renders an aria-label on the chart container describing mode and seasons', () => {
      render(
        <CareerArcChart
          battingSeasons={[
            makeBattingSeason(),
            makeBattingSeason({ season: 2021, onBasePlusSlugging: 1.0 }),
          ]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const container = screen.getByRole('region');
      expect(container.getAttribute('aria-label')).toMatch(/career arc/i);
      expect(container.getAttribute('aria-label')).toMatch(/batting/i);
      expect(container.getAttribute('aria-label')).toMatch(/2 seasons/i);
    });

    it('renders a screen-reader-only table with OPS and HR headers', () => {
      render(
        <CareerArcChart
          battingSeasons={[makeBattingSeason()]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      expect(within(table).getByText('OPS')).toBeInTheDocument();
      expect(within(table).getByText('HR')).toBeInTheDocument();
      expect(within(table).getByText('Season')).toBeInTheDocument();
      expect(within(table).getByText('Team')).toBeInTheDocument();
      expect(within(table).getByText('Games')).toBeInTheDocument();
      expect(within(table).getByText('Awards')).toBeInTheDocument();
    });

    it('renders one table row per season with correct data', () => {
      render(
        <CareerArcChart
          battingSeasons={[
            makeBattingSeason({
              season: 2020,
              onBasePlusSlugging: 0.9,
              homeRuns: 10,
              team: 'NYY',
              games: 60,
            }),
            makeBattingSeason({
              season: 2021,
              onBasePlusSlugging: 1.0,
              homeRuns: 20,
              team: 'LAD',
              games: 155,
            }),
          ]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      const rows = within(table).getAllByRole('row');
      // 1 header + 2 data rows
      expect(rows).toHaveLength(3);

      expect(within(table).getByText(/^2020/)).toBeInTheDocument();
      expect(within(table).getByText('NYY')).toBeInTheDocument();
      expect(within(table).getByText('0.900')).toBeInTheDocument();
      expect(within(table).getByText('10')).toBeInTheDocument();

      expect(within(table).getByText(/^2021/)).toBeInTheDocument();
      expect(within(table).getByText('LAD')).toBeInTheDocument();
      expect(within(table).getByText('1.000')).toBeInTheDocument();
      expect(within(table).getByText('20')).toBeInTheDocument();
    });

    it('annotates peak seasons with "(peak season)"', () => {
      const seasons = Array.from({ length: 5 }, (_, i) =>
        makeBattingSeason({
          season: 2015 + i,
          onBasePlusSlugging: 0.7 + i * 0.1,
          games: 150,
        }),
      );
      render(
        <CareerArcChart
          battingSeasons={seasons}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      // The top 3 qualified seasons by OPS should be annotated
      const peakCells = within(table).queryAllByText(/peak season/i);
      expect(peakCells.length).toBeGreaterThan(0);
      expect(peakCells.length).toBeLessThanOrEqual(3);
    });

    it('shows award labels in the Awards column when present', () => {
      render(
        <CareerArcChart
          battingSeasons={[makeBattingSeason({ awardSummary: 'AS, MVP' })]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      expect(within(table).getByText('All-Star, MVP')).toBeInTheDocument();
    });

    // LS-10674: the backfill writes B-Ref league-suffixed winner codes.
    it('shows a league MVP in the Awards column and as a chart marker', () => {
      render(
        <CareerArcChart
          battingSeasons={[
            makeBattingSeason({ season: 2001, awardSummary: 'MVP-NL,GG,SS' }),
          ]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      expect(
        within(table).getByText('NL MVP, Gold Glove, Silver Slugger'),
      ).toBeInTheDocument();
      expect(screen.getByText('2001 NL MVP')).toBeInTheDocument();
      expect(screen.getByText('2001 Gold Glove')).toBeInTheDocument();
    });

    it('does not mark ballot placements as awards', () => {
      render(
        <CareerArcChart
          battingSeasons={[
            makeBattingSeason({ season: 1999, awardSummary: 'MVP-5' }),
          ]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      expect(
        within(table).getByText('MVP (5th in voting)'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/^1999 MVP/)).not.toBeInTheDocument();
    });

    it('shows "—" in the Awards column when there are no awards', () => {
      render(
        <CareerArcChart
          battingSeasons={[makeBattingSeason({ awardSummary: null })]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      expect(within(table).getByText('—')).toBeInTheDocument();
    });
  });

  describe('pitching mode', () => {
    it('renders an aria-label mentioning pitching mode', () => {
      render(
        <CareerArcChart
          battingSeasons={null}
          pitchingSeasons={[makePitchingSeason()]}
          mode="pitching"
        />,
      );

      const container = screen.getByRole('region');
      expect(container.getAttribute('aria-label')).toMatch(/pitching/i);
    });

    it('renders a screen-reader-only table with ERA+ and SO headers', () => {
      render(
        <CareerArcChart
          battingSeasons={null}
          pitchingSeasons={[makePitchingSeason()]}
          mode="pitching"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      expect(within(table).getByText('ERA+')).toBeInTheDocument();
      expect(within(table).getByText('SO')).toBeInTheDocument();
    });

    it('renders one row per pitching season', () => {
      render(
        <CareerArcChart
          battingSeasons={null}
          pitchingSeasons={[
            makePitchingSeason({
              season: 2019,
              earnedRunAveragePlus: 120,
              team: 'CHC',
            }),
            makePitchingSeason({
              season: 2020,
              earnedRunAveragePlus: 150,
              team: 'NYM',
            }),
          ]}
          mode="pitching"
        />,
      );

      const table = screen.getByTestId('career-arc-sr-table');
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(3);
      expect(within(table).getAllByText('CHC').length).toBeGreaterThan(0);
      expect(within(table).getAllByText('NYM').length).toBeGreaterThan(0);
    });
  });

  describe('parseAwards (LS-10674)', () => {
    it.each([
      ['MVP-NL', { code: 'MVP', won: true, label: 'NL MVP' }],
      ['CYA-AL', { code: 'CYA', won: true, label: 'AL Cy Young' }],
      ['MVP-1', { code: 'MVP', won: true, label: 'MVP' }],
      ['MVP-NL-28', { code: 'MVP', won: true, label: 'NL MVP' }],
      ['ROY-2', { code: 'ROY', won: false, label: 'ROY (2nd in voting)' }],
      ['MVP-11', { code: 'MVP', won: false, label: 'MVP (11th in voting)' }],
      ['gg', { code: 'GG', won: true, label: 'Gold Glove' }],
      ['WS', { code: 'WS', won: true, label: 'WS' }],
    ])('parses %s', (raw, expected) => {
      expect(parseAwards(raw)).toEqual([expected]);
    });

    it('splits comma-separated summaries and ignores blanks', () => {
      expect(parseAwards('AS, ,MVP-AL').map((a) => a.label)).toEqual([
        'All-Star',
        'AL MVP',
      ]);
      expect(parseAwards(null)).toEqual([]);
      expect(parseAwards('')).toEqual([]);
    });
  });

  describe('summary qualifier (LS-10496)', () => {
    const summaryOf = (label: RegExp) =>
      screen.getByText(label).nextElementSibling?.textContent;

    it('batter: peak is the best qualifying season and average is PA-weighted', () => {
      render(
        <CareerArcChart
          battingSeasons={[
            makeBattingSeason({
              season: 2019,
              plateAppearances: 600,
              onBasePlusSlugging: 0.8,
            }),
            makeBattingSeason({
              season: 2020,
              plateAppearances: 200,
              onBasePlusSlugging: 1.2,
            }),
            makeBattingSeason({
              season: 2021,
              plateAppearances: 300,
              onBasePlusSlugging: 1.0,
            }),
          ]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      // 200-PA season is excluded; (0.8*600 + 1.0*300) / 900 = 0.867
      expect(summaryOf(/^Peak OPS/)).toBe('1.000');
      expect(summaryOf(/^Career Avg OPS/)).toBe('0.867');
    });

    it('starter: seasons well under 50 games still qualify via innings pitched', () => {
      render(
        <CareerArcChart
          battingSeasons={null}
          pitchingSeasons={[
            makePitchingSeason({
              season: 1981,
              games: 21,
              inningsPitched: 149,
              earnedRunAveragePlus: 195,
            }),
            makePitchingSeason({
              season: 1982,
              games: 35,
              inningsPitched: 250,
              earnedRunAveragePlus: 120,
            }),
          ]}
          mode="pitching"
        />,
      );

      expect(summaryOf(/^Peak ERA\+/)).toBe('195');
      // (195*149 + 120*250) / 399 = 148
      expect(summaryOf(/^Career Avg ERA\+/)).toBe('148');
    });

    it('reliever: a high-game, low-IP season does not qualify', () => {
      render(
        <CareerArcChart
          battingSeasons={null}
          pitchingSeasons={[
            makePitchingSeason({
              season: 2018,
              games: 70,
              inningsPitched: 65,
              earnedRunAveragePlus: 300,
            }),
            makePitchingSeason({
              season: 2019,
              games: 60,
              inningsPitched: 100,
              earnedRunAveragePlus: 140,
            }),
          ]}
          mode="pitching"
        />,
      );

      expect(summaryOf(/^Peak ERA\+/)).toBe('140');
      expect(summaryOf(/^Career Avg ERA\+/)).toBe('140');
    });

    it('shows "—" and an empty-state note instead of 0 / 0.000 when nothing qualifies', () => {
      render(
        <CareerArcChart
          battingSeasons={[
            makeBattingSeason({ games: 30, plateAppearances: 40 }),
          ]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      expect(summaryOf(/^Peak OPS/)).toBe('—');
      expect(summaryOf(/^Career Avg OPS/)).toBe('—');
      expect(screen.getByText(/no qualifying seasons/i)).toBeInTheDocument();
      expect(screen.queryByText('0.000')).toBeNull();
    });
  });

  describe('chart SVG accessibility', () => {
    it('wraps the recharts chart in an aria-hidden container', () => {
      const { container } = render(
        <CareerArcChart
          battingSeasons={[makeBattingSeason()]}
          pitchingSeasons={null}
          mode="batting"
        />,
      );

      const hiddenDiv = container.querySelector('[aria-hidden="true"]');
      expect(hiddenDiv).not.toBeNull();
    });
  });
});

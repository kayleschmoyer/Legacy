/**
 * Tests for FootballPlayerDetail (LS-7805, LS-5435) — the cross-platform NFL
 * player detail view shared by web and mobile.
 */
import React from 'react';
import {
  FootballPlayerDetail,
  type FootballPlayerDetailPlayer,
} from './FootballPlayerDetail';
import { fireEvent, render, screen, within } from '../../test-utils';

jest.mock('../stats/GameLogsTable', () => ({
  GameLogsTable: ({
    sport,
    initialPlayerId,
  }: {
    sport?: string;
    initialPlayerId?: string;
  }) => (
    <div
      data-testid="game-logs-table"
      data-sport={sport}
      data-player-id={initialPlayerId}
    />
  ),
}));

const QB_PLAYER: FootballPlayerDetailPlayer = {
  id: 1,
  firstName: 'Patrick',
  lastName: 'Mahomes',
  position: 'QB',
  isDst: false,
  nflTeam: 'KC',
  previousTeams: [],
  careerStats: {
    passing: { yds: 5000, td: 37, int: 14, rating: 105.2 },
  },
  seasonStats: {
    passing: [
      {
        season: 2023,
        team: 'KC',
        g: 16,
        cmp: 401,
        att: 597,
        yds: 4839,
        td: 41,
        int: 12,
        rating: 105.2,
      },
      {
        season: 2022,
        team: 'KC',
        g: 17,
        cmp: 435,
        att: 648,
        yds: 5250,
        td: 37,
        int: 14,
        rating: 105.2,
      },
    ],
  },
};

const RB_PLAYER: FootballPlayerDetailPlayer = {
  id: 4,
  firstName: 'Christian',
  lastName: 'McCaffrey',
  position: 'RB',
  isDst: false,
  nflTeam: 'SF',
  previousTeams: [],
  careerStats: {
    rushing: { yds: 1459, td: 14 },
    receiving: { rec: 67, yds: 564, td: 7 },
  },
  seasonStats: {
    rushing: [
      {
        season: 2023,
        team: 'SF',
        g: 16,
        att: 272,
        yds: 1459,
        td: 14,
        ydsPerAtt: 5.4,
      },
    ],
    receiving: [
      {
        season: 2023,
        team: 'SF',
        g: 16,
        tgt: 85,
        rec: 67,
        yds: 564,
        td: 7,
        ydsPerRec: 8.4,
      },
    ],
  },
};

const WR_PLAYER: FootballPlayerDetailPlayer = {
  id: 5,
  firstName: 'Davante',
  lastName: 'Adams',
  position: 'WR',
  isDst: false,
  nflTeam: 'LV',
  previousTeams: [],
  careerStats: {
    receiving: { rec: 100, yds: 1144, td: 8 },
  },
  seasonStats: {
    receiving: [
      {
        season: 2023,
        team: 'LV',
        g: 17,
        tgt: 154,
        rec: 103,
        yds: 1144,
        td: 8,
        ydsPerRec: 11.1,
      },
    ],
  },
};

const TRADED_PLAYER: FootballPlayerDetailPlayer = {
  id: 6,
  firstName: 'Davante',
  lastName: 'Adams',
  position: 'WR',
  isDst: false,
  nflTeam: 'LV',
  previousTeams: ['GB', 'KC'],
  careerStats: {
    receiving: { rec: 102, yds: 1516, td: 14 },
  },
};

const DST_PLAYER: FootballPlayerDetailPlayer = {
  id: 2,
  firstName: 'Kansas City',
  lastName: 'Chiefs',
  position: 'DST',
  isDst: true,
  nflTeam: 'KC',
  previousTeams: [],
  careerStats: {
    defense: {
      g: 34,
      sacks: 45.5,
      int: 18,
      fumRec: 11,
      defTd: 4,
      ptsAllowedPerG: 19.3,
      ydsAllowedPerG: 318.7,
    },
  },
  seasonStats: {
    defense: [
      {
        season: 2023,
        team: 'KC',
        g: 17,
        sacks: 25.0,
        int: 10,
        fumRec: 6,
        defTd: 3,
        ptsAllowed: 294,
      },
      {
        season: 2022,
        team: 'KC',
        g: 17,
        sacks: 20.5,
        int: 8,
        fumRec: 5,
        defTd: 1,
        ptsAllowed: 369,
      },
    ],
  },
};

const LB_PLAYER: FootballPlayerDetailPlayer = {
  id: 3,
  firstName: 'Micah',
  lastName: 'Parsons',
  position: 'LB',
  isDst: false,
  nflTeam: 'DAL',
  previousTeams: [],
  careerStats: {
    idp: { soloTkl: 48, astTkl: 12, sacks: 13.0, int: 1, ff: 4 },
  },
};

describe('FootballPlayerDetail', () => {
  it('renders the player name, position badge, and team', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.getByText('Patrick Mahomes')).toBeTruthy();
    expect(screen.getByText('QB')).toBeTruthy();
    expect(screen.getByText(/Kansas City/)).toBeTruthy();
  });

  describe('LS-6240 — header accessibility', () => {
    it('renders the player name as a level-1 heading for screen-reader navigation', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      expect(
        screen.getByRole('heading', { level: 1, name: 'Patrick Mahomes' }),
      ).toBeTruthy();
    });

    it('labels the team-color badge with the full franchise name', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      // The badge renders the abbreviation "KC" but must announce the full
      // team name so screen readers do not read a bare, undifferentiated code.
      expect(screen.getByLabelText('Kansas City Chiefs')).toBeTruthy();
    });

    it('labels the badge "Free Agent" when the player has no team', () => {
      const FREE_AGENT: FootballPlayerDetailPlayer = {
        id: 99,
        firstName: 'Odell',
        lastName: 'Beckham',
        position: 'WR',
        isDst: false,
        nflTeam: null,
        previousTeams: [],
        careerStats: null,
      };
      render(<FootballPlayerDetail player={FREE_AGENT} />);
      expect(screen.getByLabelText('Free Agent')).toBeTruthy();
    });
  });

  it('renders position-specific passing stats for a QB', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.getByText('Career Passing')).toBeTruthy();
    expect(screen.getByText('5,000')).toBeTruthy();
    expect(screen.getAllByText('RTG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('105.2').length).toBeGreaterThanOrEqual(1);
  });

  it('renders DST stats for a defense', () => {
    render(<FootballPlayerDetail player={DST_PLAYER} />);
    expect(screen.getByText('Career DST Stats')).toBeTruthy();
    expect(screen.getByText('Pts Allowed/G')).toBeTruthy();
  });

  it('renders per-game DST rate metrics and additional career fields (LS-6247)', () => {
    render(<FootballPlayerDetail player={DST_PLAYER} />);
    // Per-game rates derived from career games (g = 34)
    expect(screen.getByText('Sacks/G')).toBeTruthy();
    expect(screen.getByText('1.3')).toBeTruthy(); // 45.5 / 34
    expect(screen.getByText('INT/G')).toBeTruthy();
    expect(screen.getByText('0.53')).toBeTruthy(); // 18 / 34
    // Additional career fields beyond the original three
    expect(screen.getByText('Def TD')).toBeTruthy();
    expect(screen.getByText('Fum Rec')).toBeTruthy();
    expect(screen.getByText('Yds Allowed/G')).toBeTruthy();
    expect(screen.getByText('318.7')).toBeTruthy();
  });

  it('falls back to em dash for per-game rates when career games is absent (LS-6247)', () => {
    const player: FootballPlayerDetailPlayer = {
      ...DST_PLAYER,
      careerStats: { defense: { sacks: 45.5, int: 18, ptsAllowedPerG: 19.3 } },
    };
    render(<FootballPlayerDetail player={player} />);
    expect(screen.getByText('Sacks/G')).toBeTruthy();
    // Both Sacks/G and INT/G render an em dash when g is undefined
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('renders a DST season breakdown table with recent-season defense numbers (LS-6247)', () => {
    render(<FootballPlayerDetail player={DST_PLAYER} />);
    expect(screen.getByText('Defense — Season Breakdown')).toBeTruthy();
    expect(screen.getByText('DEF TD')).toBeTruthy();
    expect(screen.getByText('PTS')).toBeTruthy();
    expect(screen.getByText('2023')).toBeTruthy();
    expect(screen.getByText('2022')).toBeTruthy();
    expect(screen.getByText('294')).toBeTruthy();
  });

  it('renders IDP stats including assisted tackles for a linebacker', () => {
    render(<FootballPlayerDetail player={LB_PLAYER} />);
    expect(screen.getByText('Career IDP Stats')).toBeTruthy();
    expect(screen.getByText('Ast')).toBeTruthy();
    expect(screen.getByText('48')).toBeTruthy();
  });

  describe('LS-7637 — IDP (DL/LB/DB) defensive stats coverage', () => {
    // Distinct, non-overlapping values so a per-column assertion fails if the
    // table wires a label to the wrong field (e.g. the "wrong column for FF"
    // defect called out in the gap finding).
    const DL_PLAYER: FootballPlayerDetailPlayer = {
      id: 10,
      firstName: 'Aaron',
      lastName: 'Donald',
      position: 'DL',
      isDst: false,
      nflTeam: 'LAR',
      previousTeams: [],
      careerStats: {
        idp: { soloTkl: 87, astTkl: 34, sacks: 12.5, int: 5, ff: 9 },
      },
    };

    const DB_PLAYER: FootballPlayerDetailPlayer = {
      id: 11,
      firstName: 'Sauce',
      lastName: 'Gardner',
      position: 'DB',
      isDst: false,
      nflTeam: 'NYJ',
      previousTeams: [],
      careerStats: {
        idp: { soloTkl: 61, astTkl: 14, sacks: 0, int: 2, ff: 1 },
      },
    };

    // Reads the value rendered inside a StatCell by scoping the lookup to the
    // label's containing cell — guarding against a value bleeding in from an
    // adjacent column.
    function idpCellValue(label: string): HTMLElement {
      const cell = screen.getByText(label).parentElement;
      if (!cell) throw new Error(`No containing cell for IDP label "${label}"`);
      return cell;
    }

    it.each([
      ['DL', DL_PLAYER],
      ['LB', LB_PLAYER],
      ['DB', DB_PLAYER],
    ] as const)(
      'renders the IDP stats table for the %s position',
      (_pos, player) => {
        render(<FootballPlayerDetail player={player} />);
        expect(screen.getByText('Career IDP Stats')).toBeTruthy();
        // All five IDP columns are present and labelled.
        for (const label of ['Solo', 'Ast', 'Sacks', 'INT', 'FF']) {
          expect(screen.getByText(label)).toBeTruthy();
        }
        // DST/offense tables must not render for an IDP position.
        expect(screen.queryByText('Career DST Stats')).toBeNull();
        expect(screen.queryByText('Career Passing')).toBeNull();
      },
    );

    it('maps each IDP column to the correct stat field (guards FF/INT mix-ups)', () => {
      render(<FootballPlayerDetail player={DL_PLAYER} />);
      const expected: [string, string][] = [
        ['Solo', '87'],
        ['Ast', '34'],
        ['Sacks', '12.5'],
        ['INT', '5'],
        ['FF', '9'],
      ];
      for (const [label, value] of expected) {
        expect(within(idpCellValue(label)).getByText(value)).toBeTruthy();
      }
    });

    it('formats Sacks as a decimal (fmtFloat) for an IDP player', () => {
      render(<FootballPlayerDetail player={DL_PLAYER} />);
      // Sacks runs through fmtFloat → one decimal place.
      expect(within(idpCellValue('Sacks')).getByText('12.5')).toBeTruthy();
    });

    it('keeps a trailing decimal on whole-number sack totals', () => {
      render(<FootballPlayerDetail player={LB_PLAYER} />);
      expect(within(idpCellValue('Sacks')).getByText('13.0')).toBeTruthy();
    });

    it('renders em dashes for an IDP player whose stat fields are all null', () => {
      const NULL_IDP: FootballPlayerDetailPlayer = {
        ...DL_PLAYER,
        careerStats: {
          idp: {
            soloTkl: null,
            astTkl: null,
            sacks: null,
            int: null,
            ff: null,
          },
        },
      };
      render(<FootballPlayerDetail player={NULL_IDP} />);
      expect(screen.getByText('Career IDP Stats')).toBeTruthy();
      // One em dash per column (Solo, Ast, Sacks, INT, FF).
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
    });

    it('renders em dashes when careerStats exists but the idp block is missing', () => {
      const NO_IDP_BLOCK: FootballPlayerDetailPlayer = {
        ...DL_PLAYER,
        careerStats: {},
      };
      render(<FootballPlayerDetail player={NO_IDP_BLOCK} />);
      expect(screen.getByText('Career IDP Stats')).toBeTruthy();
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
    });

    it('shows "No stats available" for a very-old-career IDP player with null careerStats', () => {
      const NO_CAREER: FootballPlayerDetailPlayer = {
        ...DL_PLAYER,
        careerStats: null,
      };
      render(<FootballPlayerDetail player={NO_CAREER} />);
      expect(screen.getByText('No stats available')).toBeTruthy();
      expect(screen.queryByText('Career IDP Stats')).toBeNull();
    });

    it('shows the Projections upsell to a free IDP user alongside the stats table', () => {
      render(<FootballPlayerDetail player={LB_PLAYER} />);
      expect(screen.getByText('Career IDP Stats')).toBeTruthy();
      expect(screen.getByText('Projections (Premium)')).toBeTruthy();
    });

    it('hides the Projections upsell for a premium IDP user but keeps the stats table', () => {
      render(<FootballPlayerDetail player={LB_PLAYER} isPremium />);
      expect(screen.getByText('Career IDP Stats')).toBeTruthy();
      expect(screen.queryByText('Projections (Premium)')).toBeNull();
    });
  });

  it('shows "No stats available" when careerStats is null', () => {
    render(
      <FootballPlayerDetail player={{ ...QB_PLAYER, careerStats: null }} />,
    );
    expect(screen.getByText('No stats available')).toBeTruthy();
  });

  it('shows an error message when error is true', () => {
    render(<FootballPlayerDetail player={null} error />);
    expect(
      screen.getByText('Failed to load player. Please try again.'),
    ).toBeTruthy();
  });

  it('renders the back affordance and fires onBack when pressed', () => {
    const onBack = jest.fn();
    render(<FootballPlayerDetail player={QB_PLAYER} onBack={onBack} />);
    fireEvent.click(screen.getByText('Back to Players'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the back affordance when onBack is not provided', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.queryByText('Back to Players')).toBeNull();
  });

  describe('LS-5435 — Passing / Rushing / Receiving Stat Breakdowns', () => {
    it('renders passing season breakdown table for a QB', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      expect(screen.getByText('Passing — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('CMP')).toBeTruthy();
      expect(screen.getAllByText('ATT').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('RTG').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('2023')).toBeTruthy();
      expect(screen.getByText('2022')).toBeTruthy();
    });

    it('shows team column in passing breakdown rows', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      const kcs = screen.getAllByText('KC');
      expect(kcs.length).toBeGreaterThanOrEqual(2);
    });

    it('renders rushing season breakdown table for an RB', () => {
      render(<FootballPlayerDetail player={RB_PLAYER} />);
      expect(screen.getByText('Rushing — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('YDS/ATT')).toBeTruthy();
      expect(screen.getByText('5.4')).toBeTruthy();
    });

    it('renders receiving season breakdown table for an RB with receptions', () => {
      render(<FootballPlayerDetail player={RB_PLAYER} />);
      expect(screen.getByText('Receiving — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('TGT')).toBeTruthy();
      expect(screen.getByText('YDS/REC')).toBeTruthy();
    });

    it('renders receiving season breakdown table for a WR', () => {
      render(<FootballPlayerDetail player={WR_PLAYER} />);
      expect(screen.getByText('Receiving — Season Breakdown')).toBeTruthy();
      expect(screen.getByText('103')).toBeTruthy();
      expect(screen.getByText('11.1')).toBeTruthy();
    });

    it('shows NFL team context in each receiving breakdown row', () => {
      render(<FootballPlayerDetail player={WR_PLAYER} />);
      expect(screen.getAllByText('LV').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render breakdown tables when seasonStats is null', () => {
      const player: FootballPlayerDetailPlayer = {
        ...QB_PLAYER,
        seasonStats: null,
      };
      render(<FootballPlayerDetail player={player} />);
      expect(screen.queryByText('Passing — Season Breakdown')).toBeNull();
    });

    it('does not render breakdown tables when all season arrays are empty', () => {
      const player: FootballPlayerDetailPlayer = {
        ...QB_PLAYER,
        seasonStats: { passing: [], rushing: [], receiving: [] },
      };
      render(<FootballPlayerDetail player={player} />);
      expect(screen.queryByText('Passing — Season Breakdown')).toBeNull();
    });
  });

  describe('LS-6243 / FPD-019 — unknown or missing position fallback', () => {
    const FB_PLAYER: FootballPlayerDetailPlayer = {
      id: 7,
      firstName: 'Kyle',
      lastName: 'Juszczyk',
      position: 'FB',
      isDst: false,
      nflTeam: 'SF',
      previousTeams: [],
      careerStats: {
        rushing: { yds: 145, td: 2 },
        receiving: { rec: 180, yds: 1500, td: 9 },
      },
    };

    it('renders the categories that have data for an unsupported position (FB)', () => {
      render(<FootballPlayerDetail player={FB_PLAYER} />);
      expect(screen.getByText('Career Rushing')).toBeTruthy();
      expect(screen.getByText('Career Receiving')).toBeTruthy();
      expect(
        screen.queryByText('No supported stats for this position'),
      ).toBeNull();
    });

    it('renders available stats even when position is null', () => {
      const player: FootballPlayerDetailPlayer = {
        id: 8,
        firstName: 'Mystery',
        lastName: 'Player',
        position: null,
        isDst: false,
        nflTeam: 'NYJ',
        previousTeams: [],
        careerStats: { receiving: { rec: 10, yds: 100, td: 1 } },
      };
      render(<FootballPlayerDetail player={player} />);
      expect(screen.getByText('Career Receiving')).toBeTruthy();
    });

    it('shows an explanatory message when an unsupported position has no usable stats (OL)', () => {
      const player: FootballPlayerDetailPlayer = {
        id: 9,
        firstName: 'Trent',
        lastName: 'Williams',
        position: 'OL',
        isDst: false,
        nflTeam: 'SF',
        previousTeams: [],
        careerStats: {},
      };
      render(<FootballPlayerDetail player={player} />);
      expect(
        screen.getByText('No supported stats for this position'),
      ).toBeTruthy();
      // careerStats is present (just empty), so this is NOT the null-stats path
      expect(screen.queryByText('No stats available')).toBeNull();
    });
  });

  it('renders FA badge and Free Agent subtitle when nflTeam is null', () => {
    const FREE_AGENT: FootballPlayerDetailPlayer = {
      id: 99,
      firstName: 'Odell',
      lastName: 'Beckham',
      position: 'WR',
      isDst: false,
      nflTeam: null,
      previousTeams: [],
      careerStats: null,
    };
    render(<FootballPlayerDetail player={FREE_AGENT} />);
    expect(screen.getByText('FA')).toBeTruthy();
    expect(screen.getByText('Free Agent')).toBeTruthy();
    expect(screen.queryByText('?')).toBeNull();
  });

  it('shows "previously: X" when previousTeams is non-empty', () => {
    render(<FootballPlayerDetail player={TRADED_PLAYER} />);
    expect(screen.getByText('previously: GB, KC')).toBeTruthy();
  });

  it('hides the "previously" indicator when previousTeams is empty', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.queryByText(/previously:/)).toBeNull();
  });

  describe('LS-6249 — Projections premium upsell', () => {
    it('renders the "Projections (Premium)" teaser card for free users by default', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      expect(screen.getByText('Projections (Premium)')).toBeTruthy();
      expect(screen.getByText('Upgrade to Premium')).toBeTruthy();
    });

    it('mentions matchup ratings and strength-of-schedule in the upsell copy', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} />);
      expect(
        screen.getByText(/matchup ratings, and strength-of-schedule/),
      ).toBeTruthy();
    });

    it('fires onUpgrade when the Upgrade CTA is pressed', () => {
      const onUpgrade = jest.fn();
      render(<FootballPlayerDetail player={QB_PLAYER} onUpgrade={onUpgrade} />);
      fireEvent.click(screen.getByText('Upgrade to Premium'));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
    });

    it('hides the teaser for premium users', () => {
      render(<FootballPlayerDetail player={QB_PLAYER} isPremium />);
      expect(screen.queryByText('Projections (Premium)')).toBeNull();
      expect(screen.queryByText('Upgrade to Premium')).toBeNull();
    });

    it('does not render the teaser while loading (no player yet)', () => {
      render(<FootballPlayerDetail player={null} loading />);
      expect(screen.queryByText('Projections (Premium)')).toBeNull();
    });
  });

  it('renders the Game Logs section with sport=nfl and the player id pre-populated', () => {
    render(<FootballPlayerDetail player={QB_PLAYER} />);
    expect(screen.getByText('GAME LOGS')).toBeTruthy();
    const table = screen.getByTestId('game-logs-table');
    expect(table.getAttribute('data-sport')).toBe('nfl');
    expect(table.getAttribute('data-player-id')).toBe('1');
  });
});

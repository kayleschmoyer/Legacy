import {
  computeTradeCapPreview,
  formatSalary,
  formatSalaryDelta,
  type TradeCapPlayer,
} from './tradeCapPreview';

const VIEWER_TEAM_ID = 1;
const OTHER_TEAM_ID = 2;

/** A two-for-one where the viewer sends one player and receives one. */
function makePlayers(
  viewerSalaries: number[],
  incomingSalaries: number[],
): TradeCapPlayer[] {
  return [
    ...viewerSalaries.map((salary) => ({
      fromTeamId: VIEWER_TEAM_ID,
      salary,
    })),
    ...incomingSalaries.map((salary) => ({
      fromTeamId: OTHER_TEAM_ID,
      salary,
    })),
  ];
}

describe('computeTradeCapPreview', () => {
  it('returns null when no leg carries salary data (non-cap league)', () => {
    const players: TradeCapPlayer[] = [
      { fromTeamId: VIEWER_TEAM_ID, salary: null },
      { fromTeamId: OTHER_TEAM_ID, salary: null },
    ];
    expect(
      computeTradeCapPreview({
        players,
        viewerTeamId: VIEWER_TEAM_ID,
        salaryCap: 100,
        currentPayroll: 50,
      }),
    ).toBeNull();
  });

  it('returns null when the viewer is not a participant in the trade', () => {
    const players: TradeCapPlayer[] = [
      { fromTeamId: OTHER_TEAM_ID, salary: 10 },
      { fromTeamId: 3, salary: 20 },
    ];
    expect(
      computeTradeCapPreview({
        players,
        viewerTeamId: VIEWER_TEAM_ID,
        salaryCap: 100,
        currentPayroll: 50,
      }),
    ).toBeNull();
  });

  it('sums incoming and outgoing salary for the viewing team', () => {
    // Viewer sends $30 (one player), receives $50 (one player)
    const preview = computeTradeCapPreview({
      players: makePlayers([30], [50]),
      viewerTeamId: VIEWER_TEAM_ID,
      salaryCap: 200,
      currentPayroll: 100,
    });
    expect(preview).not.toBeNull();
    expect(preview?.incomingSalary).toBe(50);
    expect(preview?.outgoingSalary).toBe(30);
    expect(preview?.netSalaryDelta).toBe(20);
    expect(preview?.projectedPayroll).toBe(120);
  });

  it('flags a trade that would exceed the cap', () => {
    // Current payroll 190, net +20 → projected 210 > cap 200
    const preview = computeTradeCapPreview({
      players: makePlayers([30], [50]),
      viewerTeamId: VIEWER_TEAM_ID,
      salaryCap: 200,
      currentPayroll: 190,
    });
    expect(preview?.exceedsCap).toBe(true);
    expect(preview?.overCapBy).toBe(10);
  });

  it('does not flag a trade that stays within the cap', () => {
    const preview = computeTradeCapPreview({
      players: makePlayers([30], [50]),
      viewerTeamId: VIEWER_TEAM_ID,
      salaryCap: 200,
      currentPayroll: 100,
    });
    expect(preview?.exceedsCap).toBe(false);
    expect(preview?.overCapBy).toBe(0);
  });

  it('treats a net-negative (salary-shedding) trade as within cap even at the ceiling', () => {
    // Viewer sends $50, receives $30 → net -20, projected 180
    const preview = computeTradeCapPreview({
      players: makePlayers([50], [30]),
      viewerTeamId: VIEWER_TEAM_ID,
      salaryCap: 200,
      currentPayroll: 200,
    });
    expect(preview?.netSalaryDelta).toBe(-20);
    expect(preview?.exceedsCap).toBe(false);
  });

  it('cannot warn when current payroll is unknown, but still reports the delta', () => {
    const preview = computeTradeCapPreview({
      players: makePlayers([30], [50]),
      viewerTeamId: VIEWER_TEAM_ID,
      salaryCap: 200,
      currentPayroll: null,
    });
    expect(preview?.netSalaryDelta).toBe(20);
    expect(preview?.projectedPayroll).toBeNull();
    expect(preview?.exceedsCap).toBe(false);
  });

  it('cannot warn when the salary cap is unknown', () => {
    const preview = computeTradeCapPreview({
      players: makePlayers([30], [50]),
      viewerTeamId: VIEWER_TEAM_ID,
      salaryCap: null,
      currentPayroll: 190,
    });
    expect(preview?.exceedsCap).toBe(false);
  });

  it('treats missing (null) salary on an individual leg as $0', () => {
    const players: TradeCapPlayer[] = [
      { fromTeamId: VIEWER_TEAM_ID, salary: null },
      { fromTeamId: OTHER_TEAM_ID, salary: 40 },
    ];
    const preview = computeTradeCapPreview({
      players,
      viewerTeamId: VIEWER_TEAM_ID,
      salaryCap: 200,
      currentPayroll: 100,
    });
    expect(preview?.outgoingSalary).toBe(0);
    expect(preview?.incomingSalary).toBe(40);
    expect(preview?.netSalaryDelta).toBe(40);
  });
});

describe('formatSalary / formatSalaryDelta', () => {
  it('formats whole-dollar amounts with grouping', () => {
    expect(formatSalary(1500000)).toBe('$1,500,000');
    expect(formatSalary(0)).toBe('$0');
    expect(formatSalary(-2500)).toBe('-$2,500');
  });

  it('formats signed deltas', () => {
    expect(formatSalaryDelta(500)).toBe('+$500');
    expect(formatSalaryDelta(-500)).toBe('-$500');
    expect(formatSalaryDelta(0)).toBe('$0');
  });
});

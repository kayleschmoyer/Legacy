import { getBonusEligibleStats, getGroupOrder } from './ScoringSettingsEditor';

describe('getGroupOrder', () => {
  it('returns baseball groups when sport is baseball', () => {
    const order = getGroupOrder('baseball', null);
    expect(order).toEqual(['batting', 'pitching', 'fielding']);
  });

  it('returns baseball groups when sport is null', () => {
    const order = getGroupOrder(null, null);
    expect(order).toEqual(['batting', 'pitching', 'fielding']);
  });

  it('returns baseball groups when sport is undefined', () => {
    const order = getGroupOrder(undefined, undefined);
    expect(order).toEqual(['batting', 'pitching', 'fielding']);
  });

  it('returns football DST groups when sport is football and defensiveFormat is dst', () => {
    const order = getGroupOrder('football', 'dst');
    expect(order).toContain('passing');
    expect(order).toContain('rushing');
    expect(order).toContain('receiving');
    expect(order).toContain('kicking');
    expect(order).toContain('defense');
    expect(order).not.toContain('idp');
  });

  it('returns football DST groups when sport is football and defensiveFormat is null', () => {
    const order = getGroupOrder('football', null);
    expect(order).toContain('defense');
    expect(order).not.toContain('idp');
  });

  it('returns football IDP groups when sport is football and defensiveFormat is idp', () => {
    const order = getGroupOrder('football', 'idp');
    expect(order).toContain('passing');
    expect(order).toContain('idp');
    expect(order).not.toContain('defense');
  });

  it('excludes baseball groups when sport is football', () => {
    const order = getGroupOrder('football', 'dst');
    expect(order).not.toContain('batting');
    expect(order).not.toContain('pitching');
    expect(order).not.toContain('fielding');
  });
});

describe('getBonusEligibleStats', () => {
  const stats = [
    { id: 1, group: 'passing', displayName: 'Passing Yards' },
    { id: 2, group: 'batting', displayName: 'Home Runs' },
    { id: 3, group: 'pitching', displayName: 'Earned Runs' },
    { id: 4, group: 'defense', displayName: 'Sacks' },
    { id: 5, group: 'idp', displayName: 'Sacks' },
  ];

  it('offers only football DST-league stats for a football DST league (LS-10788)', () => {
    const eligible = getBonusEligibleStats(
      stats,
      getGroupOrder('football', 'dst'),
    );
    expect(eligible.map((s) => s.id)).toEqual([1, 4]);
  });

  it('offers only football IDP-league stats for a football IDP league', () => {
    const eligible = getBonusEligibleStats(
      stats,
      getGroupOrder('football', 'idp'),
    );
    expect(eligible.map((s) => s.id)).toEqual([1, 5]);
  });

  it('offers only baseball stats for a baseball league', () => {
    const eligible = getBonusEligibleStats(
      stats,
      getGroupOrder('baseball', null),
    );
    expect(eligible.map((s) => s.id)).toEqual([2, 3]);
  });
});

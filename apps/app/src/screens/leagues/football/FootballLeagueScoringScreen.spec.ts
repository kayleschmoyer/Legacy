import { getFootballGroupOrder } from './FootballLeagueScoringScreen';

describe('getFootballGroupOrder', () => {
  it('returns defense group and excludes idp when defensiveFormat is dst', () => {
    const order = getFootballGroupOrder('dst');
    expect(order).toContain('defense');
    expect(order).not.toContain('idp');
  });

  it('defaults to DST when defensiveFormat is null', () => {
    const order = getFootballGroupOrder(null);
    expect(order).toContain('defense');
    expect(order).not.toContain('idp');
  });

  it('defaults to DST when defensiveFormat is undefined', () => {
    const order = getFootballGroupOrder(undefined);
    expect(order).toContain('defense');
    expect(order).not.toContain('idp');
  });

  it('returns idp group and excludes defense when defensiveFormat is idp', () => {
    const order = getFootballGroupOrder('idp');
    expect(order).toContain('idp');
    expect(order).not.toContain('defense');
  });

  it('always includes offensive stat groups', () => {
    const dst = getFootballGroupOrder('dst');
    const idp = getFootballGroupOrder('idp');
    for (const group of ['passing', 'rushing', 'receiving', 'kicking']) {
      expect(dst).toContain(group);
      expect(idp).toContain(group);
    }
  });
});

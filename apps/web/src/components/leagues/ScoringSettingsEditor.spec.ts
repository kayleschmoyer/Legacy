import { getGroupOrder } from './ScoringSettingsEditor';

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

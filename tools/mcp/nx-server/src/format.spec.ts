import { projectListText } from './format';

describe('projectListText', () => {
  it('renders a minified-JSON summary header followed by bare names', () => {
    const text = projectListText({ base: 'origin/main' }, ['web', 'api']);
    const [header, ...names] = text.split('\n');
    expect(JSON.parse(header)).toEqual({ base: 'origin/main', count: 2 });
    expect(names).toEqual(['web', 'api']);
  });

  it('fills count from the list length, overriding any passed count', () => {
    const text = projectListText({ count: 99 }, ['a', 'b', 'c']);
    const header = text.split('\n')[0];
    expect(JSON.parse(header).count).toBe(3);
  });

  it('returns just the summary line (count 0) for an empty list', () => {
    const text = projectListText({ mode: 'affected' }, []);
    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toEqual({ mode: 'affected', count: 0 });
  });

  it('preserves filter fields in the summary header', () => {
    const text = projectListText(
      {
        mode: 'affected',
        filteredByTarget: 'build',
        filteredByTag: 'scope:lib',
      },
      ['lib-a'],
    );
    expect(JSON.parse(text.split('\n')[0])).toEqual({
      mode: 'affected',
      filteredByTarget: 'build',
      filteredByTag: 'scope:lib',
      count: 1,
    });
  });

  it('emits no pretty-print whitespace (single-line header)', () => {
    const header = projectListText({ direction: 'dependencies' }, ['x']).split(
      '\n',
    )[0];
    expect(header).not.toMatch(/\n|\s{2,}/);
  });
});

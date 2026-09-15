import { buildPickInspectorData } from './draftPickInspectorModel';

describe('buildPickInspectorData', () => {
  it('builds the made variant — player, meta, and Team/Position/Pick/Status rows', () => {
    const data = buildPickInspectorData({
      round: 4,
      pickLabel: '4.06',
      teamName: 'Iron Horse Club',
      state: 'made',
      playerName: 'Lou Gehrig',
      position: '1B',
      isMine: false,
    });

    expect(data).toEqual({
      eyebrow: 'Pick 4.06 · Round 4',
      title: 'Lou Gehrig',
      meta: '1B · drafted by Iron Horse Club',
      rows: [
        { label: 'Team', value: 'Iron Horse Club' },
        { label: 'Position', value: '1B' },
        { label: 'Pick', value: '4.06' },
        { label: 'Status', value: 'Rostered' },
      ],
      empty: null,
    });
  });

  it('marks a made pick on the viewer’s own roster', () => {
    const data = buildPickInspectorData({
      round: 4,
      pickLabel: '4.06',
      teamName: 'Iron Horse Club',
      state: 'made',
      playerName: 'Lou Gehrig',
      position: '1B',
      isMine: true,
    });

    expect(data.rows).toContainEqual({
      label: 'Status',
      value: 'On your roster',
    });
  });

  it('falls back to an em dash for position and drops the meta qualifier when unknown', () => {
    const data = buildPickInspectorData({
      round: 4,
      pickLabel: '4.06',
      teamName: 'Iron Horse Club',
      state: 'made',
      playerName: 'Lou Gehrig',
      position: null,
    });

    expect(data.meta).toBe('Drafted by Iron Horse Club');
    expect(data.rows).toContainEqual({ label: 'Position', value: '—' });
  });

  it('builds the on-the-clock variant with no rows for position, only Team/Pick/Status', () => {
    const data = buildPickInspectorData({
      round: 4,
      pickLabel: '4.07',
      teamName: 'Frozen Tundra',
      state: 'on-the-clock',
      isMine: false,
    });

    expect(data).toEqual({
      eyebrow: 'Pick 4.07 · Round 4',
      title: 'On the clock',
      meta: 'Frozen Tundra',
      rows: [
        { label: 'Team', value: 'Frozen Tundra' },
        { label: 'Pick', value: '4.07' },
        { label: 'Status', value: 'Choosing now' },
      ],
      empty: null,
    });
  });

  it('says "your pick" in the status row when the viewer is on the clock', () => {
    const data = buildPickInspectorData({
      round: 4,
      pickLabel: '4.07',
      teamName: 'Frozen Tundra',
      state: 'on-the-clock',
      isMine: true,
    });

    expect(data.rows).toContainEqual({
      label: 'Status',
      value: 'Choosing now — your pick',
    });
  });

  it('builds the upcoming variant with no rows and an empty-state sentence', () => {
    const data = buildPickInspectorData({
      round: 5,
      pickLabel: '5.03',
      teamName: 'Canton Calling',
      state: 'upcoming',
    });

    expect(data).toEqual({
      eyebrow: 'Pick 5.03 · Round 5',
      title: 'Not yet made',
      meta: 'Canton Calling',
      rows: [],
      empty: 'Canton Calling is on the board at 5.03.',
    });
  });

  it('falls back to "Unknown player" for a made pick with no name on file', () => {
    const data = buildPickInspectorData({
      round: 1,
      pickLabel: '1.01',
      teamName: 'Bronx Bombers',
      state: 'made',
      position: 'SS',
    });

    expect(data.title).toBe('Unknown player');
  });
});

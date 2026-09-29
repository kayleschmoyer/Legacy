import {
  down,
  up,
} from '../../../migrations/20260917_120000_mock_drafts_off_leagues';

function recordingSql() {
  const statements: string[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    statements.push(
      strings.reduce(
        (acc, part, i) => acc + part + (i < values.length ? '$' : ''),
        '',
      ),
    );
    return Promise.resolve();
  };
  return { sql, statements };
}

describe('Migration — mock drafts move off leagues (LS-10076)', () => {
  it('gives drafts.draft_mode / selection_method physical defaults', async () => {
    const { sql, statements } = recordingSql();
    await up({ sql });

    const all = statements.join('\n');
    expect(all).toContain("ALTER COLUMN draft_mode SET DEFAULT 'live'");
    expect(all).toContain(
      "ALTER COLUMN selection_method SET DEFAULT 'standard'",
    );
  });

  it('clears copy pointers before deleting every legacy mock-draft league', async () => {
    const { sql, statements } = recordingSql();
    await up({ sql });

    const clearIndex = statements.findIndex((s) =>
      s.includes('SET copied_from_profile_id = NULL'),
    );
    const deleteIndex = statements.findIndex((s) =>
      s.includes('DELETE FROM public.leagues'),
    );
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(clearIndex);
    expect(statements[deleteIndex]).toContain('WHERE is_mock_draft = true');
  });

  it('lets a seat-keyed queue row omit team_id, with seat-keyed uniques', async () => {
    const { sql, statements } = recordingSql();
    await up({ sql });

    const all = statements.join('\n');
    expect(all).toContain(
      'ALTER TABLE public.draft_queue ALTER COLUMN team_id DROP NOT NULL',
    );
    expect(all).toContain('draft_queue_uk_draft_participant_player');
    expect(all).toContain('draft_queue_uk_draft_participant_priority');
  });

  it('down reverts the defaults and re-requires draft_queue.team_id', async () => {
    const { sql, statements } = recordingSql();
    await down({ sql });

    const all = statements.join('\n');
    expect(all).toContain('ALTER COLUMN draft_mode DROP DEFAULT');
    expect(all).toContain('ALTER COLUMN selection_method DROP DEFAULT');
    expect(
      all.indexOf('DELETE FROM public.draft_queue WHERE team_id IS NULL'),
    ).toBeLessThan(all.indexOf('ALTER COLUMN team_id SET NOT NULL'));
    expect(all).not.toContain('leagues');
  });
});

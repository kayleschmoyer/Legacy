import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScoringStatGroup } from '@legacy-sports/graphql';
import { LeagueScoringEditor } from './LeagueScoringEditor';

// LS-10743: multiplier validation errors must be exposed to assistive tech —
// aria-invalid + aria-describedby on the input, and a summary that names the
// invalid fields.

jest.mock('@legacy-sports/graphql', () => ({
  ...jest.requireActual<Record<string, unknown>>('@legacy-sports/graphql'),
  useUpdateLeagueScoringProfileMutation: () => [jest.fn(), { loading: false }],
}));

function makeStat(
  id: number,
  displayName: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    multiplier: 1,
    defaultMultiplier: 1,
    definition: {
      id,
      statGroup: ScoringStatGroup.Batting,
      displayName,
      description: null,
      defaultMultiplier: 1,
      enforcePositive: false,
      enforceNegative: false,
      minMultiplier: 0,
      maxMultiplier: 20,
      ...overrides,
    },
  };
}

const profile = {
  stats: [makeStat(7, 'Hit By Pitch'), makeStat(9, 'Home Runs')],
} as unknown as React.ComponentProps<typeof LeagueScoringEditor>['profile'];

function renderEditor() {
  return render(
    <LeagueScoringEditor
      leagueId={1}
      profile={profile}
      loading={false}
      onRefetch={jest.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('LeagueScoringEditor field errors (LS-10743)', () => {
  it('leaves valid inputs without aria-invalid or aria-describedby', () => {
    renderEditor();

    const input = screen.getByLabelText('Hit By Pitch multiplier');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('links an invalid input to its error text via aria attributes', () => {
    renderEditor();

    const input = screen.getByLabelText('Hit By Pitch multiplier');
    fireEvent.change(input, { target: { value: '-3' } });

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('scoring-7-error');

    const error = document.getElementById('scoring-7-error');
    expect(error?.textContent).toBe('Must be >= 0');
  });

  it('names every invalid field in the summary', () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Hit By Pitch multiplier'), {
      target: { value: '-3' },
    });
    fireEvent.change(screen.getByLabelText('Home Runs multiplier'), {
      target: { value: '999999' },
    });

    expect(screen.getByRole('alert').textContent).toBe(
      'Fix these fields before saving: Hit By Pitch, Home Runs.',
    );
    expect(
      screen
        .getByLabelText('Home Runs multiplier')
        .getAttribute('aria-describedby'),
    ).toBe('scoring-9-error');
  });

  it('clears the aria attributes once the value is fixed', () => {
    renderEditor();

    const input = screen.getByLabelText('Hit By Pitch multiplier');
    fireEvent.change(input, { target: { value: '-3' } });
    fireEvent.change(input, { target: { value: '2' } });

    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(document.getElementById('scoring-7-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

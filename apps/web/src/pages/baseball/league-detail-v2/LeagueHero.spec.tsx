// Regression guard (LS-4278, LS-4282): DraftStatusChip label mapping for
// 'completed' → 'Season Active' has regressed 3 times — keep it tested for
// every draftStatus value and for both commissioner and manager roles, since
// all 5 E2E specs poll the commissioner panel for this badge post-draft.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LeagueHero } from './LeagueHero';

const baseLeague = {
  name: 'Test League',
  scoringLabel: 'Head-to-Head',
};

describe('LeagueHero — DraftStatusChip (manager view)', () => {
  it('shows "Season Active" when draftStatus is completed', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'completed' }}
        onBack={jest.fn()}
        isCommissioner={false}
      />,
    );
    expect(screen.getByText('Season Active')).toBeInTheDocument();
  });

  it('shows "Season Active" when draftStatus is active', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'active' }}
        onBack={jest.fn()}
        isCommissioner={false}
      />,
    );
    expect(screen.getByText('Season Active')).toBeInTheDocument();
  });

  it('shows "Drafting · Live" when draftStatus is in-progress', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'in-progress' }}
        onBack={jest.fn()}
        isCommissioner={false}
      />,
    );
    expect(screen.getByText('Drafting · Live')).toBeInTheDocument();
  });

  it('shows "Pre-Draft" when draftStatus is not-started', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'not-started' }}
        onBack={jest.fn()}
        isCommissioner={false}
      />,
    );
    expect(screen.getByText('Pre-Draft')).toBeInTheDocument();
  });

  it('shows no status chip when draftStatus is absent', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague }}
        onBack={jest.fn()}
        isCommissioner={false}
      />,
    );
    expect(screen.queryByText('Season Active')).not.toBeInTheDocument();
    expect(screen.queryByText('Drafting · Live')).not.toBeInTheDocument();
  });
});

// All 5 E2E specs poll the commissioner panel — verify the badge renders
// identically for isCommissioner={true} so a future role-gating change
// cannot silently hide the badge the specs are waiting for.
describe('LeagueHero — DraftStatusChip (commissioner view)', () => {
  it('shows "Season Active" for completed draft (commissioner)', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'completed' }}
        onBack={jest.fn()}
        isCommissioner={true}
      />,
    );
    expect(screen.getByText('Season Active')).toBeInTheDocument();
  });

  it('shows "Season Active" for active draft (commissioner)', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'active' }}
        onBack={jest.fn()}
        isCommissioner={true}
      />,
    );
    expect(screen.getByText('Season Active')).toBeInTheDocument();
  });

  it('shows "Drafting · Live" for in-progress draft (commissioner)', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'in-progress' }}
        onBack={jest.fn()}
        isCommissioner={true}
      />,
    );
    expect(screen.getByText('Drafting · Live')).toBeInTheDocument();
  });

  it('shows Commissioner chip alongside Season Active badge', () => {
    render(
      <LeagueHero
        league={{ ...baseLeague, draftStatus: 'completed' }}
        onBack={jest.fn()}
        isCommissioner={true}
      />,
    );
    expect(screen.getByText('Season Active')).toBeInTheDocument();
    expect(screen.getByText('Commissioner')).toBeInTheDocument();
  });
});

// Regression guard (LS-4278): DraftStatusChip label mapping for 'completed' → 'Season Active' has regressed twice — keep it tested.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LeagueHero } from './LeagueHero';

const baseLeague = {
  name: 'Test League',
  scoringLabel: 'Head-to-Head',
};

describe('LeagueHero — DraftStatusChip', () => {
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

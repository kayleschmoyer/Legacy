import React from 'react';
import { TrendingPlayersPreview } from './TrendingPlayersPreview';
import { render, screen } from '../../test-utils';

// LS-6276 (FBH-022) — the loading state previously rendered a bare Spinner
// with no relation to the final card layout, causing a CLS hit once real
// player cards resolved. These tests cover the skeleton that replaced it.

describe('TrendingPlayersPreview — loading skeleton (LS-6276/FBH-022)', () => {
  it('renders the skeleton instead of player cards while loading', () => {
    render(<TrendingPlayersPreview players={[]} loading />);

    expect(screen.getByTestId('trending-players-skeleton')).toBeInTheDocument();
    expect(
      screen.queryByTestId('trending-player-row-1'),
    ).not.toBeInTheDocument();
  });

  it('renders real player cards once loading finishes', () => {
    render(
      <TrendingPlayersPreview
        players={[
          { id: 1, firstName: 'Pat', lastName: 'Mahomes', position: 'QB' },
        ]}
        loading={false}
      />,
    );

    expect(
      screen.queryByTestId('trending-players-skeleton'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('trending-player-row-1')).toBeInTheDocument();
  });

  it('renders nothing when not loading and there are no players', () => {
    const { container } = render(
      <TrendingPlayersPreview players={[]} loading={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

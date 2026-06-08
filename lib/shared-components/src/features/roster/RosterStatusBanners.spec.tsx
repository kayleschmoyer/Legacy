import React from 'react';
import { RosterStatusBanners } from './RosterStatusBanners';
import { render, screen } from '../../test-utils';

describe('RosterStatusBanners', () => {
  it('renders the historical banner on a past week', () => {
    render(<RosterStatusBanners isPast isFuture={false} />);
    expect(screen.getByText('Historical Mode')).toBeTruthy();
  });

  it('renders the provisional banner on a future week', () => {
    render(<RosterStatusBanners isPast={false} isFuture />);
    expect(screen.getByText('Future Week — Provisional Lineup')).toBeTruthy();
  });

  it('renders nothing on the current week', () => {
    const { container } = render(
      <RosterStatusBanners isPast={false} isFuture={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

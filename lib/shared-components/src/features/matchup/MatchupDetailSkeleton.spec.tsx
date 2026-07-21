import React from 'react';

import { MatchupDetailSkeleton } from './MatchupDetailSkeleton';
import { render } from '../../test-utils';

describe('MatchupDetailSkeleton', () => {
  it('renders a labeled loading placeholder', () => {
    const { getByLabelText } = render(<MatchupDetailSkeleton />);
    expect(getByLabelText('Loading matchup details')).toBeTruthy();
  });
});

import React from 'react';
import { fireEvent } from '@testing-library/react';

import { DRAFT_SHEET_TABS, DraftSheetTabs } from './DraftSheetTabs';
import { render, screen } from '../../test-utils';

describe('DraftSheetTabs (LS-10165)', () => {
  it('offers Players, Queue and History, in that order', () => {
    expect(DRAFT_SHEET_TABS.map(({ label }) => label)).toEqual([
      'Players',
      'Queue',
      'History',
    ]);

    render(<DraftSheetTabs activeTab="players" onChangeTab={jest.fn()} />);

    expect(screen.getByText('Players')).toBeTruthy();
    expect(screen.getByText('Queue')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it.each(['players', 'queue', 'history'] as const)(
    'reports a tap on the %s tab',
    (tab) => {
      const onChangeTab = jest.fn();
      render(<DraftSheetTabs activeTab="players" onChangeTab={onChangeTab} />);

      fireEvent.click(screen.getByTestId(`draft-sheet-tab-${tab}`));

      expect(onChangeTab).toHaveBeenCalledWith(tab);
    },
  );
});

/**
 * LS-10465 — ResumeMockDraftBanner lists unfinished mock drafts and hands the
 * chosen one back to the consumer to navigate to.
 */
import React from 'react';
import {
  type ResumableMockDraft,
  ResumeMockDraftBanner,
} from './ResumeMockDraftBanner';
import { fireEvent, render } from '../../test-utils';

const lobby: ResumableMockDraft = {
  draftId: 7,
  sport: 'baseball',
  status: 'not-started',
  isHost: true,
  totalSeats: 8,
};
const live: ResumableMockDraft = {
  draftId: 9,
  sport: 'football',
  status: 'in-progress',
  isHost: false,
  totalSeats: 10,
};

describe('ResumeMockDraftBanner', () => {
  it('renders nothing when there is nothing to resume', () => {
    const { queryByText } = render(
      <ResumeMockDraftBanner drafts={[]} onResume={jest.fn()} />,
    );
    expect(queryByText('Resume your mock draft')).toBeNull();
  });

  it('lists each draft and resumes the one pressed', () => {
    const onResume = jest.fn();
    const { getByText, getAllByText } = render(
      <ResumeMockDraftBanner drafts={[lobby, live]} onResume={onResume} />,
    );

    expect(getByText('Resume your mock draft')).toBeTruthy();
    expect(getByText('Baseball lobby · 8 teams · Hosting')).toBeTruthy();
    expect(
      getByText('Football draft in progress · 10 teams · Joined'),
    ).toBeTruthy();

    fireEvent.click(getAllByText('Resume')[1]);
    expect(onResume).toHaveBeenCalledWith(live);
  });
});

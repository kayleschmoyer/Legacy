import React from 'react';
import { screen } from '@testing-library/react';

import { MatchupStatus } from '@legacy-sports/graphql';
import { MatchupStatusChip, statusConfigFor } from './MatchupStatusChip';
import { render } from '../../test-utils';

describe('statusConfigFor', () => {
  it('maps InProgress to the Live config with live: true', () => {
    expect(statusConfigFor(MatchupStatus.InProgress)).toMatchObject({
      label: 'Live',
      live: true,
    });
  });

  it('maps Completed to the Final config with live: false', () => {
    expect(statusConfigFor(MatchupStatus.Completed)).toMatchObject({
      label: 'Final',
      live: false,
    });
  });

  it('maps Cancelled to the Cancelled config with live: false', () => {
    expect(statusConfigFor(MatchupStatus.Cancelled)).toMatchObject({
      label: 'Cancelled',
      live: false,
    });
  });

  it('maps Scheduled to the Scheduled config with live: false', () => {
    expect(statusConfigFor(MatchupStatus.Scheduled)).toMatchObject({
      label: 'Scheduled',
      live: false,
    });
  });

  it('maps null/undefined to a "Status unknown" config', () => {
    expect(statusConfigFor(null)).toMatchObject({
      label: 'Status unknown',
      live: false,
    });
    expect(statusConfigFor(undefined)).toMatchObject({
      label: 'Status unknown',
      live: false,
    });
  });

  it('maps an unrecognized status string to "Status unknown"', () => {
    expect(statusConfigFor('some_future_status')).toMatchObject({
      label: 'Status unknown',
      live: false,
    });
  });
});

describe('MatchupStatusChip', () => {
  it('renders the bare label when no detail is provided', () => {
    render(<MatchupStatusChip status={MatchupStatus.Completed} />);
    expect(screen.getByText('Final')).toBeTruthy();
  });

  it('appends the detail after the label when provided', () => {
    render(
      <MatchupStatusChip status={MatchupStatus.InProgress} detail="Week 7" />,
    );
    expect(screen.getByText('Live · Week 7')).toBeTruthy();
  });

  it('renders "Status unknown" when status is null', () => {
    render(<MatchupStatusChip status={null} />);
    expect(screen.getByText('Status unknown')).toBeTruthy();
  });
});

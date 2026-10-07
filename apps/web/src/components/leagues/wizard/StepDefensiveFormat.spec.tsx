import React from 'react';
import { render, screen } from '@testing-library/react';
import { FOOTBALL_DST_DATA_AVAILABLE } from '@legacy-sports/utils';
import { StepDefensiveFormat } from './StepDefensiveFormat';

jest.mock('tamagui', () => {
  const Box = ({
    children,
    testID,
  }: {
    children?: React.ReactNode;
    testID?: string;
  }) => <div data-testid={testID}>{children}</div>;
  return {
    Card: Box,
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <span data-testid={testID}>{children}</span>,
    XStack: Box,
    YStack: Box,
  };
});

// Team D/ST is hidden while no team-defense players exist (LS-10727).
describe('StepDefensiveFormat — D/ST gate (LS-10727)', () => {
  function renderStep() {
    render(
      <StepDefensiveFormat
        defensiveFormat="idp"
        onChange={jest.fn()}
        scoringFormat="ppr"
        onScoringFormatChange={jest.fn()}
      />,
    );
  }

  it('offers Team D/ST only when team-defense data exists', () => {
    renderStep();
    expect(screen.queryByText('Team D/ST') !== null).toBe(
      FOOTBALL_DST_DATA_AVAILABLE,
    );
    expect(
      screen.getByText('Individual Defensive Players (IDP)'),
    ).toBeInTheDocument();
  });

  it('explains why D/ST is missing while it is hidden', () => {
    renderStep();
    expect(
      screen.queryByTestId('defensive-format-dst-unavailable') !== null,
    ).toBe(!FOOTBALL_DST_DATA_AVAILABLE);
  });
});

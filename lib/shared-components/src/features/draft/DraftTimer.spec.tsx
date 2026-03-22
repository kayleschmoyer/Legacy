import React from 'react';
import { DraftTimer } from './DraftTimer';
import { fireEvent, render } from '../../test-utils';

describe('DraftTimer', () => {
  it('renders "Draft Timer" title', () => {
    const { getByText } = render(
      <DraftTimer sport="baseball" currentPick={1} />,
    );

    expect(getByText('Draft Timer')).toBeTruthy();
  });

  it('shows current pick number', () => {
    const { getByText } = render(
      <DraftTimer sport="baseball" currentPick={5} />,
    );

    expect(getByText('Pick #5')).toBeTruthy();
  });

  it('shows speed value', () => {
    const { getByText } = render(
      <DraftTimer sport="baseball" currentPick={1} speed={45} />,
    );

    expect(getByText('45s')).toBeTruthy();
  });

  it('calls onSpeedChange with decreased speed on minus button press', () => {
    const onSpeedChangeMock = jest.fn();
    const { getByText } = render(
      <DraftTimer
        sport="baseball"
        currentPick={1}
        speed={30}
        onSpeedChange={onSpeedChangeMock}
      />,
    );

    fireEvent.click(getByText('-'));
    expect(onSpeedChangeMock).toHaveBeenCalledWith(25);
  });

  it('calls onSpeedChange with increased speed on plus button press', () => {
    const onSpeedChangeMock = jest.fn();
    const { getByText } = render(
      <DraftTimer
        sport="baseball"
        currentPick={1}
        speed={30}
        onSpeedChange={onSpeedChangeMock}
      />,
    );

    fireEvent.click(getByText('+'));
    expect(onSpeedChangeMock).toHaveBeenCalledWith(35);
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabBar } from './TabBar';

describe('TabBar', () => {
  it('renders an analytics nav action', () => {
    render(
      <TabBar
        active="overview"
        onChange={jest.fn()}
        onAnalyticsNavigate={jest.fn()}
        isMember
        isCommissioner={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Analytics' }),
    ).toBeInTheDocument();
  });

  it('calls the analytics navigation handler', () => {
    const onAnalyticsNavigate = jest.fn();

    render(
      <TabBar
        active="overview"
        onChange={jest.fn()}
        onAnalyticsNavigate={onAnalyticsNavigate}
        isMember
        isCommissioner={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    expect(onAnalyticsNavigate).toHaveBeenCalledTimes(1);
  });
});

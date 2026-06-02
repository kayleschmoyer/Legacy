import React from 'react';
import { EraFilterGrid } from './EraFilterGrid';
import { WaiverSystemField } from './WaiverFields';
import { SalaryCapField } from './SalaryCapField';
import { FREE_ERA_IDS_BY_SPORT } from './constants';
import { fireEvent, render } from '../../../test-utils';

// Clicking a child Text node bubbles to the Tamagui pressable ancestor on web
// (the same pattern CreateLeagueModal.spec uses for its stepper).

describe('premium league-create fields (LS-5174)', () => {
  describe('EraFilterGrid', () => {
    const baseProps = {
      sport: 'baseball' as const,
      value: 'all',
      onChange: jest.fn(),
      onUpgrade: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('renders every era option for the sport', () => {
      const { getByText } = render(
        <EraFilterGrid {...baseProps} isPremium={false} />,
      );
      expect(getByText('All Eras')).toBeTruthy();
      expect(getByText('Modern (2006+)')).toBeTruthy();
      expect(getByText('Dead Ball (pre-1920)')).toBeTruthy();
    });

    it('selects a free era without prompting upgrade', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('Modern (2006+)'));
      expect(onChange).toHaveBeenCalledWith('modern');
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('routes a locked premium era to onUpgrade for free users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('Dead Ball (pre-1920)'));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('selects a premium era for premium users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium
        />,
      );
      fireEvent.click(getByText('Dead Ball (pre-1920)'));
      expect(onChange).toHaveBeenCalledWith('dead_ball');
      expect(onUpgrade).not.toHaveBeenCalled();
    });
  });

  describe('WaiverSystemField', () => {
    beforeEach(() => jest.clearAllMocks());

    it('routes FAAB selection to onUpgrade for free users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <WaiverSystemField
          value="standard"
          onChange={onChange}
          isPremium={false}
          onUpgrade={onUpgrade}
        />,
      );
      fireEvent.click(getByText(/FAAB/));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('selects FAAB for premium users', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <WaiverSystemField
          value="standard"
          onChange={onChange}
          isPremium
          onUpgrade={onUpgrade}
        />,
      );
      fireEvent.click(getByText(/FAAB/));
      expect(onChange).toHaveBeenCalledWith('faab');
      expect(onUpgrade).not.toHaveBeenCalled();
    });
  });

  describe('SalaryCapField', () => {
    const baseProps = {
      enabled: false,
      onToggleEnabled: jest.fn(),
      onAmountChange: jest.fn(),
      onUpgrade: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('routes enabling the cap to onUpgrade for free users', () => {
      const onToggleEnabled = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <SalaryCapField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onToggleEnabled).not.toHaveBeenCalled();
    });

    it('enables the cap for premium users', () => {
      const onToggleEnabled = jest.fn();
      const { getByText } = render(
        <SalaryCapField
          {...baseProps}
          onToggleEnabled={onToggleEnabled}
          isPremium
        />,
      );
      fireEvent.click(getByText('On'));
      expect(onToggleEnabled).toHaveBeenCalledWith(true);
    });

    it('shows the cap amount input once enabled', () => {
      const { getByPlaceholderText } = render(
        <SalaryCapField {...baseProps} enabled isPremium />,
      );
      expect(getByPlaceholderText('e.g. 50000000')).toBeTruthy();
    });
  });

  describe('constants', () => {
    it('keeps the free baseball eras stable', () => {
      expect([...FREE_ERA_IDS_BY_SPORT.baseball].sort()).toEqual([
        'all',
        'modern',
      ]);
    });
  });
});

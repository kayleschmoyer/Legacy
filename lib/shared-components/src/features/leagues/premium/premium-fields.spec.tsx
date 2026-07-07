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

    it('shows a proactive lock on the FAAB option for free users (LS-5173)', () => {
      // The mocked Lock icon renders with data-testid="Lock"; WaiverSystemField
      // renders exactly one lock — the gated FAAB option.
      const { getByTestId } = render(
        <WaiverSystemField
          value="standard"
          onChange={jest.fn()}
          isPremium={false}
          onUpgrade={jest.fn()}
        />,
      );
      expect(getByTestId('Lock')).toBeTruthy();
    });

    it('does not lock the FAAB option for premium users (LS-5173)', () => {
      const { queryByTestId } = render(
        <WaiverSystemField
          value="standard"
          onChange={jest.fn()}
          isPremium
          onUpgrade={jest.fn()}
        />,
      );
      expect(queryByTestId('Lock')).toBeNull();
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

    // LS-6119 — advanced fields (floor, luxury tax, min salary, escalation/decay)
    it('does not render advanced fields when their onChange handlers are omitted', () => {
      const { queryByPlaceholderText } = render(
        <SalaryCapField {...baseProps} enabled isPremium />,
      );
      expect(queryByPlaceholderText('e.g. 40000000')).toBeNull();
      expect(queryByPlaceholderText('e.g. 60000000')).toBeNull();
      expect(queryByPlaceholderText('e.g. 1')).toBeNull();
      expect(queryByPlaceholderText('e.g. 10')).toBeNull();
      expect(queryByPlaceholderText('e.g. 25')).toBeNull();
    });

    it('renders and wires up advanced fields when handlers are provided', () => {
      const onSalaryFloorChange = jest.fn();
      const onLuxuryTaxThresholdChange = jest.fn();
      const onMinSalaryChange = jest.fn();
      const onSalaryEscalationPctChange = jest.fn();
      const onSalaryDecayPctChange = jest.fn();
      const { getByPlaceholderText } = render(
        <SalaryCapField
          {...baseProps}
          enabled
          isPremium
          salaryFloor={40000000}
          onSalaryFloorChange={onSalaryFloorChange}
          luxuryTaxThreshold={60000000}
          onLuxuryTaxThresholdChange={onLuxuryTaxThresholdChange}
          minSalary={1}
          onMinSalaryChange={onMinSalaryChange}
          salaryEscalationPct={10}
          onSalaryEscalationPctChange={onSalaryEscalationPctChange}
          salaryDecayPct={25}
          onSalaryDecayPctChange={onSalaryDecayPctChange}
        />,
      );

      fireEvent.change(getByPlaceholderText('e.g. 40000000'), {
        target: { value: '45000000' },
      });
      expect(onSalaryFloorChange).toHaveBeenCalledWith(45000000);

      fireEvent.change(getByPlaceholderText('e.g. 60000000'), {
        target: { value: '65000000' },
      });
      expect(onLuxuryTaxThresholdChange).toHaveBeenCalledWith(65000000);

      fireEvent.change(getByPlaceholderText('e.g. 1'), {
        target: { value: '2' },
      });
      expect(onMinSalaryChange).toHaveBeenCalledWith(2);

      fireEvent.change(getByPlaceholderText('e.g. 10'), {
        target: { value: '15' },
      });
      expect(onSalaryEscalationPctChange).toHaveBeenCalledWith(15);

      fireEvent.change(getByPlaceholderText('e.g. 25'), {
        target: { value: '30' },
      });
      expect(onSalaryDecayPctChange).toHaveBeenCalledWith(30);
    });

    it('surfaces validation errors on advanced fields', () => {
      const { getByText } = render(
        <SalaryCapField
          {...baseProps}
          enabled
          isPremium
          onMinSalaryChange={jest.fn()}
          minSalaryError="Minimum salary must be at least 1."
        />,
      );
      expect(getByText('Minimum salary must be at least 1.')).toBeTruthy();
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

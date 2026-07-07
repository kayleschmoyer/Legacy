import React from 'react';
import { EraFilterGrid } from './EraFilterGrid';
import { WaiverSystemField } from './WaiverFields';
import { SalaryCapField } from './SalaryCapField';
import { CustomEraRange } from './CustomEraRange';
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

    it('announces a locked era differently from an unlocked one (LS-6085)', () => {
      const { getByLabelText, queryByLabelText } = render(
        <EraFilterGrid {...baseProps} isPremium={false} />,
      );
      expect(
        getByLabelText('Dead Ball (pre-1920) — Locked, premium required'),
      ).toBeTruthy();
      expect(
        queryByLabelText('Dead Ball (pre-1920)', { exact: true }),
      ).toBeNull();
      expect(getByLabelText('Modern (2006+)')).toBeTruthy();
    });

    it('does not mark a premium era as locked for premium users (LS-6085)', () => {
      const { getByLabelText, queryByLabelText } = render(
        <EraFilterGrid {...baseProps} isPremium />,
      );
      expect(
        queryByLabelText('Dead Ball (pre-1920) — Locked, premium required'),
      ).toBeNull();
      expect(getByLabelText('Dead Ball (pre-1920)')).toBeTruthy();
    });

    // testID does not reach the DOM as data-testid for a raw tamagui
    // YStack in this jsdom test setup (no tamagui compiler pass), so
    // these target the tile via its aria-label like the click tests
    // above target it via visible text.

    it('routes a locked premium era to onUpgrade on Enter keydown (LS-6084)', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByLabelText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.keyDown(
        getByLabelText('Dead Ball (pre-1920) — Locked, premium required'),
        { key: 'Enter' },
      );
      expect(onUpgrade).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('selects a free era on Space keydown (LS-6084)', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByLabelText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.keyDown(getByLabelText('Modern (2006+)'), { key: ' ' });
      expect(onChange).toHaveBeenCalledWith('modern');
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('ignores unrelated keydowns (LS-6084)', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByLabelText } = render(
        <EraFilterGrid
          {...baseProps}
          onChange={onChange}
          onUpgrade={onUpgrade}
          isPremium={false}
        />,
      );
      fireEvent.keyDown(getByLabelText('Modern (2006+)'), { key: 'a' });
      expect(onChange).not.toHaveBeenCalled();
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

    // LS-6100 — a premium viewer toggling FAAB while entitlement is still
    // resolving must not have the upgrade modal fired at them.
    it('does not route a FAAB tap to onUpgrade while loading, even if isPremium is currently false', () => {
      const onChange = jest.fn();
      const onUpgrade = jest.fn();
      const { getByText } = render(
        <WaiverSystemField
          value="standard"
          onChange={onChange}
          isPremium={false}
          loading
          onUpgrade={onUpgrade}
        />,
      );
      fireEvent.click(getByText(/FAAB/));
      expect(onUpgrade).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not show the proactive lock on FAAB while loading (LS-6100)', () => {
      const { queryByTestId } = render(
        <WaiverSystemField
          value="standard"
          onChange={jest.fn()}
          isPremium={false}
          loading
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

    it('disables the toggle for free users so no activation path reaches it (LS-6114)', () => {
      // PremiumGate only blocks pointer events on the wrapper; the toggle must
      // be hard-disabled too so keyboard/programmatic activation can't reach
      // it either.
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
      expect(onToggleEnabled).not.toHaveBeenCalled();
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('disables the cap amount input for free users (LS-6114)', () => {
      const { getByPlaceholderText } = render(
        <SalaryCapField {...baseProps} enabled isPremium={false} />,
      );
      expect(getByPlaceholderText('e.g. 50000000')).toBeDisabled();
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

  describe('CustomEraRange (LS-6083)', () => {
    const baseProps = {
      onChangeStart: jest.fn(),
      onChangeEnd: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('shows no per-field errors when both years are valid 4-digit years', () => {
      const { queryByText } = render(
        <CustomEraRange {...baseProps} startYear={1940} endYear={1960} />,
      );
      expect(queryByText('Year cannot be negative.')).toBeNull();
      expect(queryByText('Enter a 4-digit year.')).toBeNull();
    });

    it('flags a negative start year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={-1940} endYear={1960} />,
      );
      expect(getByText('Year cannot be negative.')).toBeTruthy();
    });

    it('flags a negative end year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={1940} endYear={-1960} />,
      );
      expect(getByText('Year cannot be negative.')).toBeTruthy();
    });

    it('flags a non-4-digit start year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={194} endYear={1960} />,
      );
      expect(getByText('Enter a 4-digit year.')).toBeTruthy();
    });

    it('flags a non-4-digit end year with a per-field message', () => {
      const { getByText } = render(
        <CustomEraRange {...baseProps} startYear={1940} endYear={19600} />,
      );
      expect(getByText('Enter a 4-digit year.')).toBeTruthy();
    });

    it('shows no per-field error when a year is unset', () => {
      const { queryByText } = render(
        <CustomEraRange {...baseProps} startYear={undefined} endYear={1960} />,
      );
      expect(queryByText('Year cannot be negative.')).toBeNull();
      expect(queryByText('Enter a 4-digit year.')).toBeNull();
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

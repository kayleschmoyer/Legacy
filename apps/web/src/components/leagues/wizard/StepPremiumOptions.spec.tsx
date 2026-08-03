import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StepPremiumOptions } from './StepPremiumOptions';
import type { PremiumOptions } from './StepPremiumOptions';

jest.mock('tamagui', () => ({
  Text: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  XStack: ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
  }) => <div onClick={onPress}>{children}</div>,
  YStack: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  Lock: () => <span>lock-icon</span>,
}));

jest.mock('@legacy-sports/shared-components/leagues', () => ({
  CustomEraRange: () => <div>Custom Era Range</div>,
  EraFilterGrid: ({
    onUpgrade,
    isPremium,
  }: {
    onUpgrade: () => void;
    isPremium: boolean;
  }) => (
    <div>
      <span>Era Filter Grid</span>
      <button
        type="button"
        onClick={() => (isPremium ? undefined : onUpgrade())}
      >
        Pick Custom Era
      </button>
    </div>
  ),
  FaabBudgetField: ({ onChange }: { onChange: (v: number) => void }) => (
    <div>
      <span>FAAB Budget Field</span>
      <button type="button" onClick={() => onChange(250)}>
        Set FAAB Budget
      </button>
    </div>
  ),
  SalaryCapField: ({
    onUpgrade,
    isPremium,
  }: {
    onUpgrade: () => void;
    isPremium: boolean;
  }) => (
    <div>
      <span>Salary Cap Field</span>
      <button
        type="button"
        onClick={() => (isPremium ? undefined : onUpgrade())}
      >
        Enable Salary Cap
      </button>
    </div>
  ),
  WaiverSystemField: ({
    onChange,
    onUpgrade,
    isPremium,
  }: {
    onChange: (v: string) => void;
    onUpgrade: () => void;
    isPremium: boolean;
  }) => (
    <div>
      <span>Waiver System Field</span>
      <button
        type="button"
        onClick={() => (isPremium ? onChange('faab') : onUpgrade())}
      >
        Select FAAB
      </button>
    </div>
  ),
}));

jest.mock('../../PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../UpgradeModal', () => ({
  UpgradeModal: ({
    open,
    featureName,
  }: {
    open: boolean;
    featureName: string;
  }) => (open ? <div>Upgrade Modal: {featureName}</div> : null),
}));

const DEFAULT_OPTIONS: PremiumOptions = {
  selectionMethod: 'standard',
  waiverType: 'standard',
  faabBudgetDefault: 100,
  eraFilter: 'all',
  salaryCapEnabled: false,
};

function renderStep(
  overrides: Partial<{
    options: PremiumOptions;
    isPremium: boolean;
    premiumLoading: boolean;
    onChange: (options: PremiumOptions) => void;
  }> = {},
) {
  const onChange = overrides.onChange ?? jest.fn();
  render(
    <StepPremiumOptions
      sport="FOOTBALL"
      options={overrides.options ?? DEFAULT_OPTIONS}
      onChange={onChange}
      isPremium={overrides.isPremium ?? false}
      premiumLoading={overrides.premiumLoading ?? false}
    />,
  );
  return { onChange };
}

describe('StepPremiumOptions', () => {
  it('renders Standard, Auction, and Random selection method options', () => {
    renderStep();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('Random')).toBeInTheDocument();
  });

  it('does not apply Auction selection for a non-premium viewer and opens the upgrade modal instead', () => {
    const { onChange } = renderStep({ isPremium: false });
    fireEvent.click(screen.getByText('Auction'));
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText('Upgrade Modal: Auction Draft'),
    ).toBeInTheDocument();
  });

  it('applies Auction selection for a premium viewer', () => {
    const { onChange } = renderStep({ isPremium: true });
    fireEvent.click(screen.getByText('Auction'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectionMethod: 'auction' }),
    );
  });

  it('applies Standard/Random selection for any viewer without gating', () => {
    const { onChange } = renderStep({ isPremium: false });
    fireEvent.click(screen.getByText('Random'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectionMethod: 'random' }),
    );
  });

  it('does not render the FAAB budget field until waiver type is faab', () => {
    renderStep({ options: { ...DEFAULT_OPTIONS, waiverType: 'standard' } });
    expect(screen.queryByText('FAAB Budget Field')).not.toBeInTheDocument();
  });

  it('renders the FAAB budget field once waiver type is faab', () => {
    renderStep({ options: { ...DEFAULT_OPTIONS, waiverType: 'faab' } });
    expect(screen.getByText('FAAB Budget Field')).toBeInTheDocument();
  });

  it('routes a non-premium waiver upgrade attempt to the upgrade modal', () => {
    const { onChange } = renderStep({ isPremium: false });
    fireEvent.click(screen.getByText('Select FAAB'));
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText('Upgrade Modal: FAAB Waiver Settings'),
    ).toBeInTheDocument();
  });

  it('shows the free-tier explainer banner for non-premium, non-loading viewers', () => {
    renderStep({ isPremium: false, premiumLoading: false });
    expect(
      screen.getByText(/Free leagues use Standard selection/),
    ).toBeInTheDocument();
  });

  it('hides the free-tier explainer banner for premium viewers', () => {
    renderStep({ isPremium: true });
    expect(
      screen.queryByText(/Free leagues use Standard selection/),
    ).not.toBeInTheDocument();
  });

  it('renders the custom era range inputs when eraFilter is custom', () => {
    renderStep({ options: { ...DEFAULT_OPTIONS, eraFilter: 'custom' } });
    expect(screen.getByText('Custom Era Range')).toBeInTheDocument();
  });
});

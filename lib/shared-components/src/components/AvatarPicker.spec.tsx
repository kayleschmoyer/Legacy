import React from 'react';
import { AvatarPicker } from './AvatarPicker';
import { render } from '../test-utils';

describe('AvatarPicker', () => {
  const onSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Avatar Preview" text for user variant', () => {
    const { getByText } = render(
      <AvatarPicker onSelect={onSelect} variant="user" />,
    );
    expect(getByText('Avatar Preview')).toBeTruthy();
  });

  it('renders "Logo Preview" text for team variant', () => {
    const { getByText } = render(
      <AvatarPicker onSelect={onSelect} variant="team" />,
    );
    expect(getByText('Logo Preview')).toBeTruthy();
  });

  it('renders "PRESETS" section', () => {
    const { getByText } = render(<AvatarPicker onSelect={onSelect} />);
    expect(getByText('PRESETS')).toBeTruthy();
  });

  it('renders Save and Clear buttons', () => {
    const { getByText } = render(<AvatarPicker onSelect={onSelect} />);
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Clear')).toBeTruthy();
  });

  it('shows "Saving..." when loading', () => {
    const { getByText } = render(<AvatarPicker onSelect={onSelect} loading />);
    expect(getByText('Saving...')).toBeTruthy();
  });
});

import React from 'react';
import { AvatarPicker } from './AvatarPicker';
import { fireEvent, render } from '../test-utils';

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

  // LS-10443: the server only accepts user avatars on the legacy-fantasy.com
  // allowlist, so the user variant offers presets only.
  it('does not render the custom URL input for the user variant', () => {
    const { queryByText, queryByLabelText } = render(
      <AvatarPicker onSelect={onSelect} variant="user" />,
    );
    expect(queryByText('CUSTOM URL')).toBeNull();
    expect(queryByLabelText('Custom logo URL')).toBeNull();
  });

  it('renders the custom URL input for the team variant', () => {
    const { getByText, getByLabelText } = render(
      <AvatarPicker onSelect={onSelect} variant="team" />,
    );
    expect(getByText('CUSTOM URL')).toBeTruthy();
    expect(getByLabelText('Custom logo URL')).toBeTruthy();
  });

  it('rejects a non-URL custom logo with an inline error and does not select it', () => {
    const { getByLabelText, getByText, getByRole } = render(
      <AvatarPicker onSelect={onSelect} variant="team" />,
    );
    fireEvent.change(getByLabelText('Custom logo URL'), {
      target: { value: '<script>alert(1)</script>' },
    });
    fireEvent.click(getByText('Apply'));

    expect(getByRole('alert').textContent).toBe('Logo URL must be a valid URL');
    expect(getByText('No image selected')).toBeTruthy();

    fireEvent.click(getByText('Save'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('rejects a non-HTTPS custom logo URL', () => {
    const { getByLabelText, getByText, getByRole } = render(
      <AvatarPicker onSelect={onSelect} variant="team" />,
    );
    fireEvent.change(getByLabelText('Custom logo URL'), {
      target: { value: 'http://example.com/logo.png' },
    });
    fireEvent.click(getByText('Apply'));

    expect(getByRole('alert').textContent).toBe('Logo URL must use HTTPS');
  });

  it('accepts a valid HTTPS custom logo URL and clears the error on edit', () => {
    const { getByLabelText, getByText, queryByRole } = render(
      <AvatarPicker onSelect={onSelect} variant="team" />,
    );
    const input = getByLabelText('Custom logo URL');
    fireEvent.change(input, { target: { value: 'not a url' } });
    fireEvent.click(getByText('Apply'));
    expect(queryByRole('alert')).not.toBeNull();

    fireEvent.change(input, {
      target: { value: ' https://cdn.example.com/logo.png ' },
    });
    expect(queryByRole('alert')).toBeNull();
    fireEvent.click(getByText('Apply'));

    fireEvent.click(getByText('Save'));
    expect(onSelect).toHaveBeenCalledWith('https://cdn.example.com/logo.png');
  });
});

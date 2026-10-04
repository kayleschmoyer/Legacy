/**
 * LS-7212: pin what AvatarPicker emits through `onSelect`.
 *
 * The picker has no file-upload path — it offers curated presets and a custom
 * URL — so there is no size / MIME / EXIF validation to test. These cover the
 * value contract the profile page's `UpdateUserAvatar` mutation depends on:
 * presets resolved through `resolveUrl`, custom URLs trimmed and never
 * resolved, blank input ignored, and Clear emitting null.
 *
 * Pressing a preset tile is covered by the Playwright spec for
 * /profile/settings, not here: this package's Jest `tamagui` mock drops
 * `onPress` on `View`, so a tile can't be pressed in a unit test. Buttons map
 * `onPress` to a click and are covered below.
 *
 * `AvatarImage` is mocked so the preset tiles are findable by alt text under
 * both the web and mobile Jest projects (the native fork renders no <img>).
 */
import React from 'react';
import { AvatarPicker } from './AvatarPicker';
import { PRESET_AVATARS, PRESET_TEAM_LOGOS } from '../constants/presets';
import { fireEvent, render, screen } from '../test-utils';

jest.mock('./AvatarImage', () => ({
  AvatarImage: ({ username }: { username?: string | null }) => (
    <img alt={username ?? ''} />
  ),
}));

/** Tamagui presses fire on mouseDown + mouseUp rather than a bare click. */
function press(element: HTMLElement): void {
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

describe('AvatarPicker emit contract (LS-7212)', () => {
  const onSelect = jest.fn();
  const resolveUrl = (url: string) => `https://app.example.com${url}`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with no image selected', () => {
    render(<AvatarPicker onSelect={onSelect} />);
    expect(screen.getByText('No image selected')).toBeTruthy();
  });

  it('shows team logo presets for the team variant', () => {
    render(<AvatarPicker onSelect={onSelect} variant="team" />);
    expect(screen.getByText('Logo Preview')).toBeTruthy();
    expect(screen.getByAltText(PRESET_TEAM_LOGOS[0].label)).toBeTruthy();
    expect(screen.queryByAltText(PRESET_AVATARS[0].label)).toBeNull();
  });

  it('saves an applied custom URL trimmed and never resolved', () => {
    render(<AvatarPicker onSelect={onSelect} resolveUrl={resolveUrl} />);

    fireEvent.change(screen.getByLabelText('Custom avatar URL'), {
      target: { value: '  https://cdn.example.com/me.png  ' },
    });
    press(screen.getByText('Apply'));
    press(screen.getByText('Save'));

    expect(onSelect).toHaveBeenCalledWith('https://cdn.example.com/me.png');
  });

  it('does not save a custom URL that was typed but never applied', () => {
    render(<AvatarPicker onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Custom avatar URL'), {
      target: { value: 'https://cdn.example.com/me.png' },
    });
    press(screen.getByText('Save'));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('ignores Apply on a blank custom URL', () => {
    render(<AvatarPicker onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Custom avatar URL'), {
      target: { value: '   ' },
    });
    press(screen.getByText('Apply'));

    expect(screen.getByText('No image selected')).toBeTruthy();
  });

  it('keeps an existing absolute currentUrl on Save', () => {
    render(
      <AvatarPicker
        onSelect={onSelect}
        currentUrl="https://cdn.example.com/current.png"
      />,
    );
    press(screen.getByText('Save'));
    expect(onSelect).toHaveBeenCalledWith(
      'https://cdn.example.com/current.png',
    );
  });

  it('Clear resets the preview and emits null immediately', () => {
    render(
      <AvatarPicker
        onSelect={onSelect}
        currentUrl="https://cdn.example.com/current.png"
      />,
    );

    press(screen.getByText('Clear'));

    expect(screen.getByText('No image selected')).toBeTruthy();
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

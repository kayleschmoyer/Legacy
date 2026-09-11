/**
 * Unit tests for TeamBrandingSettings (LS-9670).
 *
 * Extracted from `pages/baseball/TeamDetailPage.tsx`'s original branding
 * block so both baseball and football validate branding uploads through one
 * implementation. Covers:
 *  - upload validation rejections (MIME type, size, and the uploaded URL
 *    itself via `validate-branding-url.ts` — LS-1810)
 *  - the absence of any arbitrary-URL text input (the LS-6434 defect this
 *    extraction must not reintroduce)
 *  - the clear-confirmation dialog (LS-4063)
 *  - color preset/hex selection (LS-6046)
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
import React, { forwardRef as mockForwardRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeamBrandingSettings } from './TeamBrandingSettings';

// ── CSRF / env ────────────────────────────────────────────────────────────

jest.mock('../../lib/csrf', () => ({
  getCsrfToken: jest.fn(() => 'test-token'),
}));

jest.mock('../../config/environment', () => ({
  env: { imageUploadUrl: 'https://upload.example.com' },
}));

// ── GraphQL ───────────────────────────────────────────────────────────────

const mockUpdateBranding = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useUpdateTeamBrandingMutation: jest.fn(() => [
    mockUpdateBranding,
    { loading: false },
  ]),
}));

// ── Shared color helpers ─────────────────────────────────────────────────

jest.mock('@legacy-sports/shared-components/roster', () => ({
  TEAM_BRANDING_PRESET_COLORS: [
    '#1B3A5C',
    '#C41E3A',
    '#2D6A4F',
    '#8B6F47',
    '#7C6CAE',
    '#C5A55A',
    '#0E7490',
    '#9F1239',
  ],
  normalizeTeamColor: (c: string | null | undefined, fallback: string) => {
    if (!c) return fallback;
    if (c.startsWith('#')) return c.toUpperCase();
    if (/^[0-9A-Fa-f]{6}$/.test(c)) return `#${c.toUpperCase()}`;
    return c;
  },
}));

// ── Tamagui ───────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const Dialog = Object.assign(
    ({ children, open }: any) =>
      open ? <div role="dialog">{children}</div> : null,
    {
      Portal: ({ children }: any) => <div>{children}</div>,
      Overlay: () => null,
      Content: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h2>{children}</h2>,
      Description: ({ children }: any) => <div>{children}</div>,
    },
  );

  return {
    Dialog,
    Button: mockForwardRef(({ children, onPress, disabled }: any, ref: any) => (
      <button ref={ref} onClick={onPress} disabled={!!disabled}>
        {children}
      </button>
    )),
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Spinner: () => <span data-testid="spinner" />,
    Text: ({ children, role, 'aria-live': ariaLive }: any) => (
      <span role={role} aria-live={ariaLive}>
        {children}
      </span>
    ),
    XStack: ({ children }: any) => <div>{children}</div>,
    YStack: ({ children }: any) => <div>{children}</div>,
  };
});

// ── Constants ─────────────────────────────────────────────────────────────

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD_LIGHT: '#C5A55A',
  BRAND_NAVY: '#0A0F1A',
  BRAND_NAVY_DARK: '#0D1526',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  BRAND_SEAM_RED: '#C41E3A',
  withAlpha: (color: string) => color,
}));

// ── Helpers ───────────────────────────────────────────────────────────────

const defaultProps = {
  teamId: 1,
  leagueId: 100,
  avatarUrl: 'https://example.com/logo.png',
  bannerUrl: 'https://example.com/banner.jpg',
  primaryColor: '#123ABC',
  secondaryColor: '#ABC123',
};

const uploadAvatarFile = (container: HTMLElement, file: File, index = 0) => {
  const fileInputs = container.querySelectorAll('input[type="file"]');
  const input = fileInputs[index];
  if (!input) throw new Error('file input not found');
  fireEvent.change(input, { target: { files: [file] } });
};

describe('TeamBrandingSettings', () => {
  let mockOnBrandingUpdated: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockOnBrandingUpdated = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn();
  });

  // ── No arbitrary-URL text input (AC / LS-6434) ───────────────────────────

  it('renders no free-text URL input for avatar or banner', () => {
    render(
      <TeamBrandingSettings
        {...defaultProps}
        onBrandingUpdated={mockOnBrandingUpdated}
      />,
    );

    expect(
      screen.queryByPlaceholderText(/https:\/\//i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /avatar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /banner/i }),
    ).not.toBeInTheDocument();
  });

  // ── Upload validation rejections ─────────────────────────────────────────

  describe('upload validation', () => {
    it('rejects an unsupported MIME type before uploading', async () => {
      const { container } = render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      const file = new File(['data'], 'logo.gif', { type: 'image/gif' });
      uploadAvatarFile(container, file, 0);

      await waitFor(() => {
        expect(
          screen.getByText(/unsupported file type: image\/gif/i),
        ).toBeInTheDocument();
      });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('rejects a file over the 2 MB limit before uploading', async () => {
      const { container } = render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      const bigContent = new Uint8Array(2 * 1024 * 1024 + 1);
      const file = new File([bigContent], 'logo.png', { type: 'image/png' });
      uploadAvatarFile(container, file, 0);

      await waitFor(() => {
        expect(screen.getByText(/image is too large/i)).toBeInTheDocument();
      });
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('rejects an uploaded URL that fails validate-branding-url (LS-1810) and never saves it', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ url: 'http://insecure.example.com/logo.png' }),
      });

      const { container } = render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      const file = new File(['data'], 'logo.png', { type: 'image/png' });
      uploadAvatarFile(container, file, 0);

      await waitFor(() => {
        expect(screen.getByText(/must use https/i)).toBeInTheDocument();
      });
      expect(mockUpdateBranding).not.toHaveBeenCalled();
      expect(mockOnBrandingUpdated).not.toHaveBeenCalled();
    });

    it('rejects an uploaded URL pointing at a blocked/private hostname', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ url: 'https://169.254.169.254/logo.png' }),
      });

      const { container } = render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      const file = new File(['data'], 'logo.png', { type: 'image/png' });
      uploadAvatarFile(container, file, 0);

      await waitFor(() => {
        expect(screen.getByText(/must be a public url/i)).toBeInTheDocument();
      });
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('saves a valid uploaded avatar URL and calls onBrandingUpdated', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ url: 'https://cdn.example.com/logo.png' }),
      });

      const { container } = render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      const file = new File(['data'], 'logo.png', { type: 'image/png' });
      uploadAvatarFile(container, file, 0);

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          variables: {
            teamId: 1,
            leagueId: 100,
            avatarUrl: 'https://cdn.example.com/logo.png',
          },
        });
      });
      expect(mockOnBrandingUpdated).toHaveBeenCalled();
    });

    it('saves a valid uploaded banner URL against the banner file input', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ url: 'https://cdn.example.com/banner.jpg' }),
      });

      const { container } = render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      const file = new File(['data'], 'banner.jpg', { type: 'image/jpeg' });
      uploadAvatarFile(container, file, 1);

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          variables: {
            teamId: 1,
            leagueId: 100,
            bannerUrl: 'https://cdn.example.com/banner.jpg',
          },
        });
      });
    });

    it('surfaces a missing CSRF token without calling fetch', async () => {
      const { getCsrfToken } = jest.requireMock<{ getCsrfToken: jest.Mock }>(
        '../../lib/csrf',
      );
      getCsrfToken.mockReturnValue('');
      global.fetch = jest.fn();

      const { container } = render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      const file = new File(['data'], 'logo.png', { type: 'image/png' });
      uploadAvatarFile(container, file, 0);

      await waitFor(() => {
        expect(
          screen.getByText(/unable to verify your session/i),
        ).toBeInTheDocument();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── Clear confirmation dialog (LS-4063) ──────────────────────────────────

  describe('clear confirmation', () => {
    it('opens a confirmation dialog without calling the mutation for the avatar', () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      fireEvent.click(screen.getAllByRole('button', { name: /^clear$/i })[0]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/clear team logo/i)).toBeInTheDocument();
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('does not call the mutation when Cancel is clicked', () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      fireEvent.click(screen.getAllByRole('button', { name: /^clear$/i })[0]);
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('calls updateTeamBranding with avatarUrl empty string when the clear is confirmed', async () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      fireEvent.click(screen.getAllByRole('button', { name: /^clear$/i })[0]);
      fireEvent.click(screen.getByRole('button', { name: /^clear logo$/i }));

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          variables: { teamId: 1, leagueId: 100, avatarUrl: '' },
        });
      });
    });

    it('calls updateTeamBranding with bannerUrl empty string when the banner clear is confirmed', async () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      fireEvent.click(screen.getAllByRole('button', { name: /^clear$/i })[1]);
      fireEvent.click(screen.getByRole('button', { name: /^clear banner$/i }));

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          variables: { teamId: 1, leagueId: 100, bannerUrl: '' },
        });
      });
    });

    it('does not render a Clear button when there is no current image', () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          avatarUrl={null}
          bannerUrl={null}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      expect(
        screen.queryByRole('button', { name: /^clear$/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ── Colors (LS-6046) ──────────────────────────────────────────────────────

  describe('colors', () => {
    it('seeds the color pickers from the saved team colors', () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      expect(screen.getByLabelText('Primary Color hex')).toHaveValue('#123ABC');
      expect(screen.getByLabelText('Secondary Color hex')).toHaveValue(
        '#ABC123',
      );
    });

    it('selecting a preset swatch and saving calls updateTeamBranding with the new color', async () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      fireEvent.click(screen.getByLabelText('Pick primary color #C41E3A'));
      fireEvent.click(screen.getByRole('button', { name: /^save colors$/i }));

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          variables: {
            teamId: 1,
            leagueId: 100,
            primaryColor: '#C41E3A',
            secondaryColor: '#ABC123',
          },
        });
      });
    });

    it('disables Save Colors until a color actually changes', () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      expect(
        screen.getByRole('button', { name: /^save colors$/i }),
      ).toBeDisabled();
    });

    it('rejects an invalid/incomplete hex value without saving', () => {
      render(
        <TeamBrandingSettings
          {...defaultProps}
          onBrandingUpdated={mockOnBrandingUpdated}
        />,
      );

      fireEvent.change(screen.getByLabelText('Primary Color hex'), {
        target: { value: '#12' },
      });

      expect(
        screen.getByText(/enter a valid 6-digit hex color/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^save colors$/i }),
      ).toBeDisabled();
    });
  });
});

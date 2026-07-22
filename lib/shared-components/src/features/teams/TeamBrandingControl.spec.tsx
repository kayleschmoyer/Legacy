/**
 * LS-7809: TeamBrandingControl is the cross-platform team identity editor
 * (name, brand colors, logo). These tests cover the save wiring it shares with
 * web's canonical Team tab via useTeamBranding: the rename guard (only saves a
 * dirty, non-empty name) and the branding save (colors + logo).
 */
import React from 'react';
import { TeamBrandingControl } from './TeamBrandingControl';
import { validateLogoUrl } from './useTeamBranding';
import { act, fireEvent, render, screen } from '../../test-utils';

const mockRenameTeam = jest.fn(() => Promise.resolve({ data: {} }));
const mockUpdateBranding = jest.fn(() => Promise.resolve({ data: {} }));
jest.mock('@legacy-sports/graphql', () => ({
  useRenameTeamMutation: () => [mockRenameTeam, { loading: false }],
  useUpdateTeamBrandingMutation: () => [mockUpdateBranding, { loading: false }],
}));

jest.mock('@tamagui/lucide-icons', () => ({
  Shirt: () => null,
  Upload: () => null,
}));

const mockPickAndUploadLogo = jest.fn();
let mockUploadState: {
  uploading: boolean;
  uploadError: string | null;
} = { uploading: false, uploadError: null };
const mockUseTeamLogoUpload = jest.fn(
  (options: { onUploaded: (url: string) => void }) => ({
    uploading: mockUploadState.uploading,
    uploadError: mockUploadState.uploadError,
    pickAndUploadLogo: (): void => {
      mockPickAndUploadLogo(options);
    },
  }),
);
jest.mock('./useTeamLogoUpload', () => ({
  useTeamLogoUpload: (options: Parameters<typeof mockUseTeamLogoUpload>[0]) =>
    mockUseTeamLogoUpload(options),
}));

type Children = { children?: React.ReactNode };
type ButtonProps = Children & {
  onPress?: () => void;
  disabled?: boolean;
  'aria-label'?: string;
};
type InputProps = {
  value?: string;
  onChangeText?: (next: string) => void;
  placeholder?: string;
  editable?: boolean;
  'data-testid'?: string;
};

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Button = ({
    children,
    onPress,
    disabled,
    'aria-label': ariaLabel,
  }: ButtonProps) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onPress}
      disabled={!!disabled}
    >
      {children}
    </button>
  );
  const Input = ({
    value,
    onChangeText,
    placeholder,
    editable,
    'data-testid': testId,
  }: InputProps) => (
    <input
      data-testid={testId}
      value={value ?? ''}
      placeholder={placeholder}
      disabled={editable === false}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  );
  const Label = ({ children }: Children) => <label>{children}</label>;
  const Spinner = () => <span>spinner</span>;
  const Separator = () => <hr />;

  return {
    Button,
    Card: PassThrough,
    H4: PassThrough,
    Input,
    Label,
    Separator,
    Spinner,
    Text: PassThrough,
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

const TEAM = {
  id: 1,
  name: 'Old Name',
  primaryColor: '#1B3A5C',
  secondaryColor: '#C5A55A',
  logoUrl: '',
};

const getSaveNameButton = () =>
  screen.getByRole('button', { name: /^(Save Name|Saving…|Saved)$/ });

describe('TeamBrandingControl (LS-7809)', () => {
  beforeEach(() => {
    mockRenameTeam.mockClear();
    mockUpdateBranding.mockClear();
    mockUseTeamLogoUpload.mockClear();
    mockPickAndUploadLogo.mockClear();
    mockUploadState = { uploading: false, uploadError: null };
  });

  it('disables Save Name until the name is changed', () => {
    render(<TeamBrandingControl teamId={1} leagueId={2} team={TEAM} />);
    expect(getSaveNameButton()).toBeDisabled();
  });

  it('renames the team with the trimmed new name', async () => {
    render(<TeamBrandingControl teamId={1} leagueId={2} team={TEAM} />);

    fireEvent.change(screen.getByTestId('team-name-input'), {
      target: { value: '  New Name  ' },
    });
    expect(getSaveNameButton()).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(getSaveNameButton());
      await Promise.resolve();
    });

    expect(mockRenameTeam).toHaveBeenCalledWith({
      variables: { teamId: 1, leagueId: 2, newName: 'New Name' },
    });
  });

  it('saves colors and logo via the branding mutation', async () => {
    render(<TeamBrandingControl teamId={1} leagueId={2} team={TEAM} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Pick primary color #C41E3A' }),
    );
    fireEvent.change(screen.getByTestId('team-logo-input'), {
      target: { value: 'https://cdn.example.com/logo.png' },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /^(Save Branding|Saving…|Saved)$/ }),
      );
      await Promise.resolve();
    });

    expect(mockUpdateBranding).toHaveBeenCalledWith({
      variables: {
        teamId: 1,
        leagueId: 2,
        primaryColor: '#C41E3A',
        secondaryColor: '#C5A55A',
        logoUrl: 'https://cdn.example.com/logo.png',
      },
    });
  });

  it('shows a validation error and disables Save Branding for an invalid logo URL', async () => {
    render(<TeamBrandingControl teamId={1} leagueId={2} team={TEAM} />);

    fireEvent.change(screen.getByTestId('team-logo-input'), {
      target: { value: 'javascript:alert(1)' },
    });

    expect(await screen.findByText(/must use https/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^(Save Branding|Saving…|Saved)$/ }),
    ).toBeDisabled();
    expect(mockUpdateBranding).not.toHaveBeenCalled();
  });

  it('shows a validation error for a non-image https URL', async () => {
    render(<TeamBrandingControl teamId={1} leagueId={2} team={TEAM} />);

    fireEvent.change(screen.getByTestId('team-logo-input'), {
      target: { value: 'https://example.com/page' },
    });

    expect(await screen.findByText(/image file/i)).toBeInTheDocument();
  });

  it('hides save buttons when canEdit is false', () => {
    render(
      <TeamBrandingControl
        teamId={1}
        leagueId={2}
        team={TEAM}
        canEdit={false}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /^(Save Name|Saving…|Saved)$/ }),
    ).toBeNull();
  });

  describe('logo upload (LS-7685)', () => {
    const getUploadButton = () =>
      screen.getByRole('button', { name: /^(Upload Logo|Uploading…)$/ });

    it('hides the Upload Logo button when canUploadLogo is not set (default, all tiers)', () => {
      render(<TeamBrandingControl teamId={1} leagueId={2} team={TEAM} />);
      expect(
        screen.queryByRole('button', { name: /^(Upload Logo|Uploading…)$/ }),
      ).toBeNull();
    });

    it('hides the Upload Logo button when canUploadLogo is false (non-premium)', () => {
      render(
        <TeamBrandingControl
          teamId={1}
          leagueId={2}
          team={TEAM}
          canUploadLogo={false}
        />,
      );
      expect(
        screen.queryByRole('button', { name: /^(Upload Logo|Uploading…)$/ }),
      ).toBeNull();
    });

    it('shows and wires the Upload Logo button when canUploadLogo is true (premium)', () => {
      render(
        <TeamBrandingControl
          teamId={1}
          leagueId={2}
          team={TEAM}
          canUploadLogo
          imageUploadUrl="https://api.example.com"
        />,
      );

      fireEvent.click(getUploadButton());
      expect(mockPickAndUploadLogo).toHaveBeenCalledTimes(1);
    });

    it('still hides the pasted-URL path unaffected for all tiers (AC7)', () => {
      render(
        <TeamBrandingControl
          teamId={1}
          leagueId={2}
          team={TEAM}
          canUploadLogo={false}
        />,
      );
      expect(screen.getByTestId('team-logo-input')).not.toBeDisabled();
    });

    it('shows an inline error when the upload hook reports a failure', () => {
      mockUploadState = { uploading: false, uploadError: 'Upload failed.' };
      render(
        <TeamBrandingControl
          teamId={1}
          leagueId={2}
          team={TEAM}
          canUploadLogo
        />,
      );
      expect(screen.getByText('Upload failed.')).toBeInTheDocument();
    });

    it('disables the button and shows "Uploading…" while an upload is in flight', () => {
      mockUploadState = { uploading: true, uploadError: null };
      render(
        <TeamBrandingControl
          teamId={1}
          leagueId={2}
          team={TEAM}
          canUploadLogo
        />,
      );
      expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled();
    });

    it('populates logoUrl and flows into saveBranding when the upload succeeds', async () => {
      mockUseTeamLogoUpload.mockImplementation(({ onUploaded }) => ({
        uploading: false,
        uploadError: null,
        pickAndUploadLogo: () => {
          onUploaded('https://cdn.example.com/uploaded-logo.png');
        },
      }));

      render(
        <TeamBrandingControl
          teamId={1}
          leagueId={2}
          team={TEAM}
          canUploadLogo
          imageUploadUrl="https://api.example.com"
        />,
      );

      fireEvent.click(getUploadButton());
      expect(screen.getByTestId('team-logo-input')).toHaveValue(
        'https://cdn.example.com/uploaded-logo.png',
      );

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', {
            name: /^(Save Branding|Saving…|Saved)$/,
          }),
        );
        await Promise.resolve();
      });

      expect(mockUpdateBranding).toHaveBeenCalledWith({
        variables: {
          teamId: 1,
          leagueId: 2,
          primaryColor: '#1B3A5C',
          secondaryColor: '#C5A55A',
          logoUrl: 'https://cdn.example.com/uploaded-logo.png',
        },
      });
    });
  });
});

describe('validateLogoUrl', () => {
  it('returns null for empty string', () => {
    expect(validateLogoUrl('')).toBeNull();
  });

  it('returns null for a valid https image URL', () => {
    expect(validateLogoUrl('https://cdn.example.com/logo.png')).toBeNull();
    expect(validateLogoUrl('https://cdn.example.com/logo.webp?v=2')).toBeNull();
    expect(validateLogoUrl('https://cdn.example.com/logo.svg')).toBeNull();
  });

  it('rejects javascript: protocol', () => {
    expect(validateLogoUrl('javascript:alert(1)')).toMatch(/https/i);
  });

  it('rejects data: URIs', () => {
    expect(validateLogoUrl('data:image/png;base64,abc')).toMatch(/https/i);
  });

  it('rejects http: URLs', () => {
    expect(validateLogoUrl('http://example.com/logo.png')).toMatch(/https/i);
  });

  it('rejects URLs without an image extension', () => {
    expect(validateLogoUrl('https://example.com/page')).toMatch(/image file/i);
  });

  it('rejects malformed strings', () => {
    expect(validateLogoUrl('not a url at all')).toMatch(/valid url/i);
  });
});

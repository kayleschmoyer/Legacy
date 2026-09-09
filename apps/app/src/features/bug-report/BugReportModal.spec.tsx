import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import BugReportModal from './BugReportModal';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockCaptureError = jest.fn<void, [unknown]>();
jest.mock('@legacy-sports/rollbar/native', () => ({
  captureError: (err: unknown): void => mockCaptureError(err),
}));

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
jest.mock('@legacy-sports/shared-components', () => ({
  SecureStorageProvider: {
    getItem: (key: string): Promise<string | null> => mockGetItem(key),
  },
}));

const mockConfig: Record<string, string | undefined> = {};
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return mockConfig;
  },
}));

const mockFetch = jest.fn<
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>,
  [string, RequestInit]
>();
global.fetch = mockFetch as unknown as typeof fetch;

interface MockAsset {
  uri: string;
  mimeType?: string;
  fileName?: string;
  base64?: string;
}

interface MockPickerResult {
  canceled: boolean;
  assets: MockAsset[];
}

// expo-image-picker resolves to apps/app/__mocks__/expo-image-picker.js via
// this project's jest moduleNameMapper; grab its jest.fn()s to drive the
// picker from here.
const mockRequestMediaLibraryPermissionsAsync =
  ImagePicker.requestMediaLibraryPermissionsAsync as unknown as jest.Mock<
    Promise<{ granted: boolean }>,
    []
  >;
const mockLaunchImageLibraryAsync =
  ImagePicker.launchImageLibraryAsync as unknown as jest.Mock<
    Promise<MockPickerResult>,
    [Record<string, unknown>]
  >;

/** 'AAAA' base64-decodes to 3 bytes; jira-proxy estimates len * 3 / 4. */
const SMALL_BASE64 = 'AAAA';

function imageAsset(overrides: Partial<MockAsset> = {}): MockAsset {
  return {
    uri: 'file:///tmp/shot.png',
    mimeType: 'image/png',
    fileName: 'shot.png',
    base64: SMALL_BASE64,
    ...overrides,
  };
}

/** Attach one image via the picker and wait for it to appear in the list. */
async function attachImage(asset: MockAsset = imageAsset()): Promise<void> {
  mockLaunchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [asset],
  });
  fireEvent.press(screen.getByText('+ Add screenshot'));
  await waitFor(() => {
    expect(mockLaunchImageLibraryAsync).toHaveBeenCalled();
  });
}

// Tamagui components require a TamaguiProvider/theme context to render for
// real; every other native screen spec in this repo swaps them for plain RN
// primitives instead (see help.spec.tsx / AboutScreen.spec.tsx).
jest.mock('tamagui', () => {
  const {
    View,
    Text: RNText,
    TextInput,
    ActivityIndicator,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  const passthrough =
    (Tag: React.ComponentType<Record<string, unknown>>) =>
    ({
      children,
      onPress,
      ...rest
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      [key: string]: unknown;
    }) => (
      <Tag onPress={onPress} {...rest}>
        {children}
      </Tag>
    );
  return {
    createTokens: (tokens: unknown) => tokens,
    View: passthrough(View),
    YStack: passthrough(View),
    XStack: passthrough(View),
    Text: passthrough(RNText),
    Button: ({
      children,
      onPress,
      disabled,
      ...rest
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      [key: string]: unknown;
    }) => (
      <RNText onPress={disabled ? undefined : onPress} {...rest}>
        {children}
      </RNText>
    ),
    Spinner: () => <ActivityIndicator />,
    TextArea: ({
      value,
      onChangeText,
      editable,
      ...rest
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      editable?: boolean;
      [key: string]: unknown;
    }) => (
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        {...rest}
      />
    ),
  };
});

function okBugResponse(issueKey: string): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return { ok: true, status: 201, json: () => Promise.resolve({ issueKey }) };
}

function errorResponse(
  status: number,
  error: string,
): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: false, status, json: () => Promise.resolve({ error }) };
}

describe('BugReportModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.jiraProxyUrl = 'https://api.example.com/jira';
    mockConfig.appVersion = '1.0.0';
    mockConfig.commitSha = 'abc1234';
    mockGetItem.mockResolvedValue('stored-jwt');
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });
  });

  it('renders nothing when not visible', () => {
    render(<BugReportModal visible={false} onClose={jest.fn()} />);
    expect(screen.queryByText('Report a Bug')).toBeNull();
  });

  it('submits to the jira-proxy /bug endpoint with a Bearer token and shows the created issue key', async () => {
    mockFetch.mockResolvedValue(okBugResponse('LS-1234'));
    render(<BugReportModal visible onClose={jest.fn()} />);

    fireEvent.changeText(
      screen.getByLabelText('Bug description'),
      'Everything is broken',
    );
    fireEvent.press(screen.getByText('Submit Report'));

    await waitFor(() => {
      expect(screen.getByText('Thanks! Created LS-1234.')).toBeTruthy();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.example.com/jira/bug');
    expect(options.method).toBe('POST');
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer stored-jwt');
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.description).toBe('Everything is broken');
    expect(body.labels).toEqual(['user-reported', 'mobile']);
    expect(body.issueType).toBe('Bug');
    expect(body.appVersion).toBe('1.0.0');
    expect(body.commitSha).toBe('abc1234');
  });

  it('shows an error message and reports to Rollbar when the submission fails', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(500, 'Failed to create bug report'),
    );
    render(<BugReportModal visible onClose={jest.fn()} />);

    fireEvent.changeText(
      screen.getByLabelText('Bug description'),
      'Something broke',
    );
    fireEvent.press(screen.getByText('Submit Report'));

    await waitFor(() => {
      expect(screen.getByText('⚠ Failed to create bug report')).toBeTruthy();
    });
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel is pressed', () => {
    const onClose = jest.fn();
    render(<BugReportModal visible onClose={onClose} />);

    fireEvent.press(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('screenshot attachments (LS-9445)', () => {
    it('omits the attachments key entirely when nothing is attached', async () => {
      mockFetch.mockResolvedValue(okBugResponse('LS-1'));
      render(<BugReportModal visible onClose={jest.fn()} />);

      fireEvent.changeText(
        screen.getByLabelText('Bug description'),
        'No screenshot here',
      );
      fireEvent.press(screen.getByText('Submit Report'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as Record<string, unknown>;
      expect(body).not.toHaveProperty('attachments');
    });

    it('sends a picked image as base64 in the attachments array', async () => {
      mockFetch.mockResolvedValue(okBugResponse('LS-2'));
      render(<BugReportModal visible onClose={jest.fn()} />);

      await attachImage();

      expect(await screen.findByText('🖼 shot.png')).toBeTruthy();

      fireEvent.changeText(
        screen.getByLabelText('Bug description'),
        'Here is what I saw',
      );
      fireEvent.press(screen.getByText('Submit Report'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
        attachments: Array<Record<string, unknown>>;
      };
      expect(body.attachments).toEqual([
        { name: 'shot.png', type: 'image/png', data: SMALL_BASE64 },
      ]);
    });

    it('asks the picker for images only, as base64, limited to the remaining slots', async () => {
      render(<BugReportModal visible onClose={jest.fn()} />);
      await attachImage();

      // base64 is what makes the payload possible at all — there is no
      // FileReader on native to convert a URI after the fact.
      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaTypes: 'images',
          base64: true,
          selectionLimit: 3,
        }),
      );

      // Second pick may only claim the two slots that are left.
      await attachImage(imageAsset({ fileName: 'second.png' }));
      expect(mockLaunchImageLibraryAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({ selectionLimit: 2 }),
      );
    });

    it('generates a filename when the picker does not supply one', async () => {
      render(<BugReportModal visible onClose={jest.fn()} />);
      await attachImage(
        imageAsset({ fileName: undefined, mimeType: 'image/jpeg' }),
      );

      expect(await screen.findByText(/🖼 screenshot-\d+-0\.jpeg/)).toBeTruthy();
    });

    it('shows a permission message and attaches nothing when access is denied', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
        granted: false,
      });
      render(<BugReportModal visible onClose={jest.fn()} />);

      fireEvent.press(screen.getByText('+ Add screenshot'));

      expect(
        await screen.findByText(/⚠ Photo library permission is required/),
      ).toBeTruthy();
      expect(mockLaunchImageLibraryAsync).not.toHaveBeenCalled();
    });

    it('rejects an image over the 2 MB limit', async () => {
      render(<BugReportModal visible onClose={jest.fn()} />);

      // Decoded size is len * 3 / 4, so this is ~2.1 MB — just over the cap.
      await attachImage(
        imageAsset({ base64: 'A'.repeat(2_800_000), fileName: 'huge.png' }),
      );

      expect(await screen.findByText(/huge\.png is too large/)).toBeTruthy();
      expect(screen.queryByText('🖼 huge.png')).toBeNull();
    });

    it('rejects a non-image media type', async () => {
      render(<BugReportModal visible onClose={jest.fn()} />);
      await attachImage(
        imageAsset({ mimeType: 'video/mp4', fileName: 'clip.mp4' }),
      );

      expect(await screen.findByText(/Unsupported file type/)).toBeTruthy();
      expect(screen.queryByText('🖼 clip.mp4')).toBeNull();
    });

    it('caps the list at 3 images and hides the add button once full', async () => {
      render(<BugReportModal visible onClose={jest.fn()} />);

      await attachImage(imageAsset({ fileName: 'one.png' }));
      await attachImage(imageAsset({ fileName: 'two.png' }));
      await attachImage(imageAsset({ fileName: 'three.png' }));

      expect(await screen.findByText('🖼 three.png')).toBeTruthy();
      expect(screen.queryByText('+ Add screenshot')).toBeNull();
    });

    it('removes an individual attachment', async () => {
      render(<BugReportModal visible onClose={jest.fn()} />);

      await attachImage(imageAsset({ fileName: 'keep.png' }));
      await attachImage(imageAsset({ fileName: 'drop.png' }));
      expect(await screen.findByText('🖼 drop.png')).toBeTruthy();

      fireEvent.press(screen.getByLabelText('Remove drop.png'));

      await waitFor(() => {
        expect(screen.queryByText('🖼 drop.png')).toBeNull();
      });
      expect(screen.getByText('🖼 keep.png')).toBeTruthy();
    });

    it('clears attachments when the modal is closed', async () => {
      render(<BugReportModal visible onClose={jest.fn()} />);

      await attachImage();
      expect(await screen.findByText('🖼 shot.png')).toBeTruthy();

      fireEvent.press(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('🖼 shot.png')).toBeNull();
      });
    });
  });

  describe('feature request mode (LS-9247)', () => {
    it('renders feature-request copy instead of bug-report copy', () => {
      render(<BugReportModal visible kind="feature" onClose={jest.fn()} />);

      expect(screen.getByText('Suggest a Feature')).toBeTruthy();
      expect(screen.queryByText('Report a Bug')).toBeNull();
      expect(screen.getByText('Submit Suggestion')).toBeTruthy();
      expect(screen.getByLabelText('Feature request description')).toBeTruthy();
    });

    it('submits as a Task with the feature-request label so it does not land in the bug backlog', async () => {
      mockFetch.mockResolvedValue(okBugResponse('LS-4321'));
      render(<BugReportModal visible kind="feature" onClose={jest.fn()} />);

      fireEvent.changeText(
        screen.getByLabelText('Feature request description'),
        'Add dark mode to the league page',
      );
      fireEvent.press(screen.getByText('Submit Suggestion'));

      await waitFor(() => {
        expect(screen.getByText('Thanks! Created LS-4321.')).toBeTruthy();
      });

      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('https://api.example.com/jira/bug');
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body.issueType).toBe('Task');
      expect(body.labels).toEqual([
        'user-reported',
        'mobile',
        'feature-request',
      ]);
      expect(body.summary).toBe('Add dark mode to the league page');
      expect(body.description).toBe('Add dark mode to the league page');
    });
  });
});

import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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
    (Tag: React.ComponentType<{ children?: React.ReactNode }>) =>
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
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) => <RNText onPress={disabled ? undefined : onPress}>{children}</RNText>,
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

function okBugResponse(issueKey: string): unknown {
  return { ok: true, status: 201, json: () => Promise.resolve({ issueKey }) };
}

function errorResponse(status: number, error: string): unknown {
  return { ok: false, status, json: () => Promise.resolve({ error }) };
}

describe('BugReportModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.jiraProxyUrl = 'https://api.example.com/jira';
    mockConfig.appVersion = '1.0.0';
    mockConfig.commitSha = 'abc1234';
    mockGetItem.mockResolvedValue('stored-jwt');
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
});

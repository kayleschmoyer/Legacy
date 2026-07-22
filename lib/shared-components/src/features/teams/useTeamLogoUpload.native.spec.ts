/**
 * LS-7685: native team-logo upload (expo-image-picker -> image-upload lambda,
 * Bearer JWT transport). Explicitly imports the `.native` module (mirrors
 * `utils/SecureStorage.spec.ts`) since this package's own jest config does
 * not prioritize `.native.ts` resolution — see useTeamLogoUpload.ts's header.
 */
import { act, renderHook } from '@testing-library/react';

import { useTeamLogoUpload } from './useTeamLogoUpload.native';

interface MockAsset {
  uri: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
}

interface MockPickerResult {
  canceled: boolean;
  assets: MockAsset[] | null;
}

interface MockFetchResponse {
  ok?: boolean;
  status?: number;
  blob?: () => Promise<{ size: number }>;
  json?: () => Promise<{ url?: string; error?: string }>;
}

const mockRequestMediaLibraryPermissionsAsync = jest.fn<
  Promise<{ granted: boolean }>,
  []
>();
const mockLaunchImageLibraryAsync = jest.fn<Promise<MockPickerResult>, []>();

jest.mock('expo-image-picker', () => ({
  __esModule: true,
  requestMediaLibraryPermissionsAsync: () =>
    mockRequestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: () => mockLaunchImageLibraryAsync(),
}));

const ASSET: MockAsset = {
  uri: 'file:///tmp/logo.png',
  mimeType: 'image/png',
  fileSize: 1024,
  width: 100,
  height: 100,
};

const mockBlob = (size: number): { size: number } => ({ size });

describe('useTeamLogoUpload (native, LS-7685)', () => {
  const onUploaded = jest.fn<void, [string]>();
  const getAuthToken = jest.fn<Promise<string | null>, []>(() =>
    Promise.resolve('jwt-token'),
  );
  let fetchMock: jest.Mock<Promise<MockFetchResponse>, [string, RequestInit?]>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [ASSET],
    });
    fetchMock = jest.fn<Promise<MockFetchResponse>, [string, RequestInit?]>();
    getAuthToken.mockResolvedValue('jwt-token');
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const setup = (
    overrides: Partial<Parameters<typeof useTeamLogoUpload>[0]> = {},
  ) =>
    renderHook(() =>
      useTeamLogoUpload({
        teamId: 1,
        imageUploadUrl: 'https://api.example.com',
        getAuthToken,
        onUploaded,
        ...overrides,
      }),
    );

  it('starts idle', () => {
    const { result } = setup();
    expect(result.current.uploading).toBe(false);
    expect(result.current.uploadError).toBeNull();
  });

  it('uploads the picked asset and calls onUploaded with the returned URL', async () => {
    fetchMock
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob(500)) }) // fetch(asset.uri)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ url: 'https://cdn.example.com/logo.png' }),
      }); // upload POST

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(onUploaded).toHaveBeenCalledWith('https://cdn.example.com/logo.png');
    expect(result.current.uploading).toBe(false);
    expect(result.current.uploadError).toBeNull();

    const uploadCall = fetchMock.mock.calls[1];
    expect(uploadCall[0]).toBe(
      'https://api.example.com/images/upload?teamId=1&imageType=avatar',
    );
    expect(uploadCall[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        Authorization: 'Bearer jwt-token',
      },
    });
  });

  it('does nothing when the user cancels the picker', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(result.current.uploadError).toBeNull();
  });

  it('shows an error and does not upload when permission is denied', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      granted: false,
    });

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(result.current.uploadError).toMatch(/permission/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported mime type before uploading', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...ASSET, mimeType: 'image/gif' }],
    });

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(result.current.uploadError).toMatch(/unsupported file type/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an asset over the 2 MB limit before uploading', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ ...ASSET, fileSize: 3 * 1024 * 1024 }],
    });

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(result.current.uploadError).toMatch(/too large/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an error when imageUploadUrl is not configured', async () => {
    const { result } = setup({ imageUploadUrl: undefined });
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(result.current.uploadError).toMatch(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an error when no auth token is available', async () => {
    getAuthToken.mockResolvedValueOnce(null);

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(result.current.uploadError).toMatch(/signed in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the lambda error message on a non-2xx upload response (NSFW rejection etc.)', async () => {
    fetchMock
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob(500)) })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({ error: 'Image failed content screening.' }),
      });

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(result.current.uploadError).toBe('Image failed content screening.');
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('surfaces a network-error message when the upload fetch rejects', async () => {
    fetchMock
      .mockResolvedValueOnce({ blob: () => Promise.resolve(mockBlob(500)) })
      .mockRejectedValueOnce(new Error('Network request failed'));

    const { result } = setup();
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(result.current.uploadError).toBe('Network request failed');
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('is a no-op when teamId is null', async () => {
    const { result } = setup({ teamId: null });
    await act(async () => {
      await result.current.pickAndUploadLogo();
    });

    expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

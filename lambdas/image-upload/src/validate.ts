/** Maximum allowed image size: 2 MB */
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Magic bytes (file signatures) for supported image types.
 * We verify these to prevent content-type spoofing.
 */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/webp': [
    // RIFF....WEBP — bytes 0-3 = RIFF, bytes 8-11 = WEBP
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
};

/**
 * Validate that the image buffer is within size limits and has the expected
 * magic bytes for its declared MIME type.
 *
 * Throws with a descriptive message on failure.
 */
export function validateImageBuffer(buf: Buffer, mimeType: string): void {
  if (buf.length === 0) {
    throw new Error('Image file is empty');
  }

  if (buf.length > MAX_SIZE_BYTES) {
    const sizeMb = (buf.length / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Image is too large (${sizeMb} MB). Maximum allowed size is 2 MB.`,
    );
  }

  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  const allMatch = signatures.every(({ offset, bytes }) =>
    bytes.every((b, i) => buf[offset + i] === b),
  );

  if (!allMatch) {
    throw new Error(
      `File content does not match declared type (${mimeType}). Please upload a valid image.`,
    );
  }
}

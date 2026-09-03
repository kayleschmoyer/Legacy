import { inflateRawSync } from 'node:zlib';

/**
 * Minimal read-only ZIP reader built on `node:zlib`.
 *
 * Exists so the Retrosheet ingest can pull three members out of a season
 * archive without adding a third-party zip dependency (the repo only has
 * `adm-zip` transitively, which `@nx/dependency-checks` would reject).
 *
 * Deliberately supports only what the Retrosheet archives use: STORED (0) and
 * DEFLATE (8), no ZIP64, no encryption. Anything else raises rather than
 * returning subtly wrong bytes.
 *
 * Reading members individually also means `plays.csv` — roughly 87% of a
 * season archive's uncompressed bytes — is never decompressed.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  // The EOCD is at the end, but a trailing comment (<= 65535 bytes) may follow
  // it, so scan backwards for the signature.
  const maxComment = 0xffff;
  const start = Math.max(0, buffer.length - maxComment - 22);
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new Error('Not a ZIP archive: end-of-central-directory not found');
}

/** Parse the central directory into an entry list. */
export function listZipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);

  if (centralDirOffset === ZIP64_SENTINEL || entryCount === 0xffff) {
    throw new Error('ZIP64 archives are not supported');
  }

  const entries: ZipEntry[] = [];
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error(`Corrupt central directory at offset ${cursor}`);
    }
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf-8');

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Decompress one member. Sizes come from the central directory rather than the
 * local header, because archives written with a streaming data descriptor
 * leave the local header sizes zeroed.
 */
export function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Corrupt local header for ${entry.name}`);
  }

  // The local header's name/extra lengths can differ from the central
  // directory's, so re-read them here.
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return Buffer.from(data);
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(data);
  }
  throw new Error(
    `Unsupported compression method ${entry.compressionMethod} for ${entry.name}`,
  );
}

/** Convenience: read a named member as UTF-8, or null when absent. */
export function readZipEntryText(buffer: Buffer, name: string): string | null {
  const entry = listZipEntries(buffer).find((e) => e.name === name);
  if (!entry) {
    return null;
  }
  return readZipEntry(buffer, entry).toString('utf-8');
}

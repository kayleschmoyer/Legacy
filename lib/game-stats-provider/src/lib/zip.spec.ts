import { crc32 } from 'node:zlib';
import { deflateRawSync } from 'node:zlib';

import { listZipEntries, readZipEntry, readZipEntryText } from './zip';

interface Member {
  name: string;
  content: string;
  /** 0 = stored, 8 = deflate */
  method?: number;
}

/**
 * Build a real ZIP archive in memory so the reader is exercised against the
 * actual byte format rather than a mock.
 */
function buildZip(members: Member[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const member of members) {
    const method = member.method ?? 8;
    const raw = Buffer.from(member.content, 'utf-8');
    const data = method === 0 ? raw : deflateRawSync(raw);
    const name = Buffer.from(member.name, 'utf-8');
    const sum = crc32(raw);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);

  return Buffer.concat([localBlock, centralBlock, eocd]);
}

describe('zip reader', () => {
  const members: Member[] = [
    { name: '1927batting.csv', content: 'gid,id\nBSN192704120,statj101\n' },
    { name: '1927pitching.csv', content: 'gid,id\nBSN192704120,pettj103\n' },
    // The big member the ingest deliberately never decompresses.
    { name: '1927plays.csv', content: 'x'.repeat(50_000) },
  ];

  it('lists every member from the central directory', () => {
    const entries = listZipEntries(buildZip(members));
    expect(entries.map((e) => e.name)).toEqual([
      '1927batting.csv',
      '1927pitching.csv',
      '1927plays.csv',
    ]);
  });

  it('round-trips deflated content', () => {
    const zip = buildZip(members);
    expect(readZipEntryText(zip, '1927batting.csv')).toBe(members[0].content);
    expect(readZipEntryText(zip, '1927pitching.csv')).toBe(members[1].content);
  });

  it('round-trips STORED (uncompressed) content', () => {
    const zip = buildZip([{ name: 'a.csv', content: 'hello', method: 0 }]);
    expect(readZipEntryText(zip, 'a.csv')).toBe('hello');
  });

  it('returns null for an absent member rather than throwing', () => {
    expect(readZipEntryText(buildZip(members), 'nope.csv')).toBeNull();
  });

  it('reads a member without decompressing the rest of the archive', () => {
    const zip = buildZip(members);
    const entries = listZipEntries(zip);
    const batting = entries.find((e) => e.name === '1927batting.csv');
    if (!batting) {
      throw new Error('expected 1927batting.csv in the central directory');
    }
    // Reading one member must not require touching plays.csv.
    expect(readZipEntry(zip, batting).toString('utf-8')).toBe(
      members[0].content,
    );
  });

  it('reports sizes from the central directory', () => {
    const entries = listZipEntries(buildZip(members));
    const plays = entries.find((e) => e.name === '1927plays.csv');
    expect(plays?.uncompressedSize).toBe(50_000);
    // Highly compressible content: the stored bytes are far smaller.
    expect(plays?.compressedSize).toBeLessThan(1_000);
  });

  it('rejects a buffer that is not a zip', () => {
    expect(() => listZipEntries(Buffer.from('not a zip at all'))).toThrow(
      /end-of-central-directory/i,
    );
  });

  it('rejects an unsupported compression method', () => {
    const zip = buildZip([{ name: 'a.csv', content: 'x', method: 0 }]);
    const entry = { ...listZipEntries(zip)[0], compressionMethod: 12 };
    expect(() => readZipEntry(zip, entry)).toThrow(/Unsupported compression/);
  });
});

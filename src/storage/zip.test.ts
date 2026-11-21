import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, createZip, looksLikeZip, readZip } from './zip';

const text = (value: string) => new Blob([value]);
const bytes = (...values: number[]) => new Blob([new Uint8Array(values)]);

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zip round trip', () => {
  it('writes and reads back text and binary files, including odd names', async () => {
    const zip = await createZip([
      { name: 'backup.json', data: text('{"a":1}') },
      { name: 'photos/é ü.jpg', data: bytes(0, 255, 128, 1) },
      { name: 'empty.txt', data: text('') },
    ]);
    expect(await looksLikeZip(zip)).toBe(true);

    const entries = await readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['backup.json', 'photos/é ü.jpg', 'empty.txt']);
    expect(await (await entries[0]!.read()).text()).toBe('{"a":1}');
    expect([...new Uint8Array(await (await entries[1]!.read()).arrayBuffer())]).toEqual([
      0, 255, 128, 1,
    ]);
    expect((await entries[2]!.read()).size).toBe(0);
  });

  it('handles an empty archive', async () => {
    expect(await readZip(await createZip([]))).toEqual([]);
  });

  it('is not fooled by a file that is not a zip', async () => {
    expect(await looksLikeZip(text('{"json": true}'))).toBe(false);
    await expect(readZip(text('hello'))).rejects.toThrow(/not a zip/);
  });

  it('detects corrupted contents', async () => {
    const zip = await createZip([{ name: 'a.txt', data: text('hello world') }]);
    const raw = new Uint8Array(await zip.arrayBuffer());
    const flipAt = 30 + 'a.txt'.length;
    raw[flipAt] = (raw[flipAt] ?? 0) ^ 0xff; // flip a byte of the stored data
    const [entry] = await readZip(new Blob([raw]));
    await expect(entry!.read()).rejects.toThrow(/damaged/);
  });

  it('detects a truncated archive', async () => {
    const zip = await createZip([{ name: 'a.txt', data: text('hello world') }]);
    const raw = new Uint8Array(await zip.arrayBuffer());
    // Cutting the tail off loses the central directory.
    await expect(readZip(new Blob([raw.slice(0, raw.length - 30)]))).rejects.toThrow();
  });

  it('reads deflated entries written by other tools', async () => {
    const content = 'compress me '.repeat(50);
    const packed = new Uint8Array(deflateRawSync(Buffer.from(content)));
    const crc = crc32(new TextEncoder().encode(content));
    const name = new TextEncoder().encode('x.txt');

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, packed.length, true);
    local.setUint32(22, content.length, true);
    local.setUint16(26, name.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, 8, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, packed.length, true);
    central.setUint32(24, content.length, true);
    central.setUint16(28, name.length, true);
    const dataLength = 30 + name.length + packed.length;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, 46 + name.length, true);
    end.setUint32(16, dataLength, true);

    const zip = new Blob([local.buffer, name, packed, central.buffer, name, end.buffer]);
    const [entry] = await readZip(zip);
    expect(await (await entry!.read()).text()).toBe(content);
  });
});

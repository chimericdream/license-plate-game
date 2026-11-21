/**
 * A minimal ZIP writer and reader. The writer stores files uncompressed (JPEGs
 * don't shrink anyway); the reader also accepts deflated entries so a backup
 * that was re-zipped by another tool still opens. No ZIP64, no encryption.
 */

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const MAX_32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipInput {
  name: string;
  data: Blob;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export async function createZip(entries: readonly ZipInput[], now = new Date()): Promise<Blob> {
  if (entries.length > MAX_ENTRIES) throw new Error('Too many files for a zip.');
  const stamp = dosDateTime(now);
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new Uint8Array(encoder.encode(entry.name));
    const size = entry.data.size;
    if (size >= MAX_32 || offset >= MAX_32) throw new Error('Too much data for a zip.');
    const crc = crc32(new Uint8Array(await entry.data.arrayBuffer()));

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_SIGNATURE, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, stamp.time, true);
    local.setUint16(12, stamp.date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, entry.data);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, CENTRAL_SIGNATURE, true);
    header.setUint16(4, 20, true); // version made by
    header.setUint16(6, 20, true); // version needed
    header.setUint16(8, UTF8_FLAG, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, stamp.time, true);
    header.setUint16(14, stamp.date, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, size, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    central.push(new Uint8Array(header.buffer), name);

    offset += 30 + name.length + size;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  if (offset + centralSize >= MAX_32) throw new Error('Too much data for a zip.');
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END_SIGNATURE, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

export interface ZipEntry {
  name: string;
  size: number;
  /** Reads (and, if needed, inflates) the file, checking its checksum. */
  read(): Promise<Blob>;
}

/** True when the blob starts like a zip file. */
export async function looksLikeZip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

const corrupt = () => new Error('That zip file is damaged.');

async function inflate(data: Blob): Promise<Blob> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error("This browser can't open compressed zip files.");
  }
  return new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
}

export async function readZip(file: Blob): Promise<ZipEntry[]> {
  // The end-of-central-directory record is in the last 22 bytes plus an optional comment.
  const tailStart = Math.max(0, file.size - 22 - 0xffff);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i -= 1) {
    if (tail.getUint32(i, true) === END_SIGNATURE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('That file is not a zip file.');

  const count = tail.getUint16(end + 10, true);
  const centralSize = tail.getUint32(end + 12, true);
  const centralOffset = tail.getUint32(end + 16, true);
  if (count === MAX_ENTRIES || centralSize === MAX_32 || centralOffset === MAX_32) {
    throw new Error('That zip file is too large to open here.');
  }
  if (centralOffset + centralSize > file.size) throw corrupt();

  const directory = new DataView(
    await file.slice(centralOffset, centralOffset + centralSize).arrayBuffer(),
  );
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;

  for (let n = 0; n < count; n += 1) {
    if (at + 46 > directory.byteLength || directory.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw corrupt();
    }
    const flags = directory.getUint16(at + 8, true);
    const method = directory.getUint16(at + 10, true);
    const crc = directory.getUint32(at + 16, true);
    const compressedSize = directory.getUint32(at + 20, true);
    const size = directory.getUint32(at + 24, true);
    const nameLength = directory.getUint16(at + 28, true);
    const extraLength = directory.getUint16(at + 30, true);
    const commentLength = directory.getUint16(at + 32, true);
    const localOffset = directory.getUint32(at + 42, true);
    if (at + 46 + nameLength > directory.byteLength) throw corrupt();
    const name = decoder.decode(new Uint8Array(directory.buffer, at + 46, nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    entries.push({
      name,
      size,
      async read() {
        if (flags & ENCRYPTED_FLAG) throw new Error('Encrypted zip files are not supported.');
        if (compressedSize === MAX_32 || size === MAX_32) throw corrupt();
        const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
        if (local.byteLength < 30 || local.getUint32(0, true) !== LOCAL_SIGNATURE) throw corrupt();
        const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
        const raw = file.slice(start, start + compressedSize);
        if (raw.size !== compressedSize) throw corrupt();

        let data: Blob;
        if (method === 0) data = raw;
        else if (method === 8) data = await inflate(raw);
        else throw new Error('That zip file uses a compression method that is not supported.');

        if (data.size !== size) throw corrupt();
        if (crc32(new Uint8Array(await data.arrayBuffer())) !== crc) throw corrupt();
        return data;
      },
    });
  }
  return entries;
}

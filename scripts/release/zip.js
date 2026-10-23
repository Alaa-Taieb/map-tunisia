// Minimal dependency-free ZIP writer/reader (store + deflate, no ZIP64: every entry stays under 4 GB).
// Output is deterministic: entries are sorted and carry a fixed timestamp, so the same inputs give the same bytes.
import fs from 'node:fs';
import zlib from 'node:zlib';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// 2020-01-01 00:00:00 in DOS date/time, so archives do not change from run to run.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

/**
 * Write a ZIP file.
 * @param {string} outFile
 * @param {{name: string, data: Buffer}[]} entries  `name` uses forward slashes
 */
export function writeZip(outFile, entries) {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const fd = fs.openSync(outFile, 'w');
  let offset = 0;
  const write = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  const central = [];
  try {
    for (const { name, data } of sorted) {
      const nameBuf = Buffer.from(name, 'utf8');
      const deflated = zlib.deflateRawSync(data, { level: 9 });
      const useDeflate = deflated.length < data.length;
      const body = useDeflate ? deflated : data;
      const crc = crc32(data);
      const method = useDeflate ? 8 : 0;
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6); // UTF-8 names
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(DOS_TIME, 10);
      local.writeUInt16LE(DOS_DATE, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      central.push({ nameBuf, crc, method, csize: body.length, size: data.length, offset });
      write(local);
      write(nameBuf);
      write(body);
    }
    const cdStart = offset;
    for (const e of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(20, 6);
      h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(e.method, 10);
      h.writeUInt16LE(DOS_TIME, 12);
      h.writeUInt16LE(DOS_DATE, 14);
      h.writeUInt32LE(e.crc, 16);
      h.writeUInt32LE(e.csize, 20);
      h.writeUInt32LE(e.size, 24);
      h.writeUInt16LE(e.nameBuf.length, 28);
      h.writeUInt32LE(e.offset, 42);
      write(h);
      write(e.nameBuf);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(offset - cdStart, 12);
    end.writeUInt32LE(cdStart, 16);
    write(end);
  } finally {
    fs.closeSync(fd);
  }
}

/** Read a ZIP file (central directory, store/deflate). Returns `Map<name, Buffer>`; verifies every CRC. */
export function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error(`${file}: not a ZIP file`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`${file}: corrupt central directory`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (crc32(data) !== crc) throw new Error(`${file}: CRC mismatch for ${name}`);
    out.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

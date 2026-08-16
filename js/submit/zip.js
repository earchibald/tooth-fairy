// Minimal ZIP writer — STORE only, no compression, no dependencies.
//
// This exists for one reason: a browser without the File System Access
// API can only be handed files through anchor downloads, and the second
// such download trips Chrome's and Safari's "allow multiple downloads"
// permission. If the user never sees that prompt, or dismisses it, the
// files vanish silently — an export that appears to succeed and delivers
// nothing. One archive is one download, so the permission never applies.
//
// Compression is pointless here: the audio is already an encoded codec
// stream, and the events file is a few kilobytes.

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ZIP stores timestamps as DOS date/time, whose epoch is 1980-01-01.
// Anything earlier (including the Unix epoch) cannot be represented, so
// it clamps rather than wrapping into a nonsense date.
export function dosDateTime(ms) {
  const d = new Date(ms);
  const year = d.getFullYear();
  if (!Number.isFinite(ms) || year < 1980) return { time: 0, date: 33 }; // 1980-01-01
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function u8(...bytes) {
  return Uint8Array.from(bytes);
}

function le16(v) {
  return u8(v & 0xff, (v >>> 8) & 0xff);
}

function le32(v) {
  return u8(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// entries: [{ name, bytes: Uint8Array, modifiedAt?: number }]
export function buildZip(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;
    const { time, date } = dosDateTime(entry.modifiedAt);

    const local = concat([
      le32(0x04034b50), le16(20), le16(0), le16(0),
      le16(time), le16(date), le32(crc), le32(size), le32(size),
      le16(name.length), le16(0), name, entry.bytes,
    ]);
    locals.push(local);

    centrals.push(concat([
      le32(0x02014b50), le16(20), le16(20), le16(0), le16(0),
      le16(time), le16(date), le32(crc), le32(size), le32(size),
      le16(name.length), le16(0), le16(0), le16(0), le16(0),
      le32(0), le32(offset), name,
    ]));

    offset += local.length;
  }

  const central = concat(centrals);
  const eocd = concat([
    le32(0x06054b50), le16(0), le16(0),
    le16(entries.length), le16(entries.length),
    le32(central.length), le32(offset), le16(0),
  ]);

  return concat([...locals, central, eocd]);
}

// Packs File/Blob objects into a single archive File.
export async function zipFiles(files, zipName) {
  const entries = [];
  for (const file of files) {
    entries.push({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      modifiedAt: file.lastModified,
    });
  }
  return new File([buildZip(entries)], zipName, { type: 'application/zip' });
}

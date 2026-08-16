import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, dosDateTime, buildZip, zipFiles } from '../js/submit/zip.js';

const enc = (s) => new TextEncoder().encode(s);

test('crc32 matches the known check value', () => {
  // The standard CRC-32 check: "123456789" -> 0xCBF43926.
  assert.equal(crc32(enc('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('dosDateTime clamps anything before the 1980 zip epoch', () => {
  // The Unix epoch cannot be represented; it must not wrap to a bogus date.
  assert.deepEqual(dosDateTime(0), { time: 0, date: 33 });
  assert.deepEqual(dosDateTime(NaN), { time: 0, date: 33 });
  const d = new Date(1990, 5, 15, 12, 30, 20);
  const { date } = dosDateTime(d.getTime());
  assert.equal(date >>> 9, 10, 'year offset from 1980');
  assert.equal((date >>> 5) & 0xf, 6, 'month');
  assert.equal(date & 0x1f, 15, 'day');
});

test('buildZip lays out the signatures and entry count', () => {
  const bytes = buildZip([{ name: 'a.txt', bytes: enc('alpha') }]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'local file header');
  // End-of-central-directory sits in the last 22 bytes (no comment).
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50, 'end of central directory');
  assert.equal(view.getUint16(eocd + 10, true), 1, 'entry count');
});

// The real contract is that other tools can open it, not that it round-trips
// through this module's own reader.
test('the archive is readable by the system unzip', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hyt-zip-'));
  const audio = new Uint8Array(5000);
  for (let i = 0; i < audio.length; i++) audio[i] = (i * 31) & 0xff;

  const zip = await zipFiles([
    new File(['{"id":"x"}\n{"seq":0}\n'], 'hyt-session-x.jsonl', { type: 'text/plain' }),
    new File([audio], 'hyt-session-x-r1.m4a', { type: 'audio/mp4' }),
  ], 'hyt-session-x.zip');

  const zipPath = join(dir, 'out.zip');
  writeFileSync(zipPath, Buffer.from(await zip.arrayBuffer()));

  execFileSync('unzip', ['-qq', 'out.zip'], { cwd: dir });
  const names = readdirSync(dir).sort();
  assert.deepEqual(names, ['hyt-session-x-r1.m4a', 'hyt-session-x.jsonl', 'out.zip']);

  assert.equal(readFileSync(join(dir, 'hyt-session-x.jsonl'), 'utf8'), '{"id":"x"}\n{"seq":0}\n');
  assert.deepEqual(new Uint8Array(readFileSync(join(dir, 'hyt-session-x-r1.m4a'))), audio,
    'binary payload must survive byte for byte');
});

test('unzip -t reports no CRC or structural errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hyt-zip-'));
  const zip = await zipFiles([
    new File(['one'], 'a.txt', { type: 'text/plain' }),
    new File(['two'], 'b.txt', { type: 'text/plain' }),
  ], 'pair.zip');
  writeFileSync(join(dir, 'pair.zip'), Buffer.from(await zip.arrayBuffer()));
  const out = execFileSync('unzip', ['-t', 'pair.zip'], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /No errors detected/);
});

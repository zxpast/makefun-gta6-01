// A minimal PNG encoder: raw RGB rows through node:zlib, wrapped in IHDR/IDAT/IEND
// with a correct CRC32. No dependency, deterministic bytes for the same pixels.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), 8 + data.length);
  return out;
}

/** Encode an RGB buffer (width*height*3 bytes) as a PNG. */
export function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // Two filterings are tried per row set — None and Sub (each byte minus the one
  // three to its left) — and the smaller deflate wins, so flat sky rows and
  // detailed road rows each get the encoding that fits them best.
  const stride = width * 3;
  const rawNone = Buffer.alloc(height * (1 + stride));
  const rawSub = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    rawNone[y * (1 + stride)] = 0;
    rawNone.set(rgb.subarray(y * stride, (y + 1) * stride), y * (1 + stride) + 1);
    rawSub[y * (1 + stride)] = 1;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 3 ? rgb[y * stride + i - 3] : 0;
      rawSub[y * (1 + stride) + 1 + i] = (rgb[y * stride + i] - left + 256) % 256;
    }
  }
  const idatNone = deflateSync(rawNone, { level: 9 });
  const idatSub = deflateSync(rawSub, { level: 9 });
  const idat = idatSub.length < idatNone.length ? idatSub : idatNone;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

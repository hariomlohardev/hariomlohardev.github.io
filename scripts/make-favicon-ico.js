#!/usr/bin/env node
"use strict";
/* favicon.png -> favicon.ico (16 + 32 + 48)
 *
 * /favicon.ico is the one icon URL a browser asks for without being told to.
 * Nothing in the repo answered it, so every host 404'd on it — github.io and
 * vercel.app alike — for anything that does not parse <link rel="icon">: older
 * browsers, feed readers, bookmark and history UIs, and any request for a page
 * that is not HTML.
 *
 * Written from favicon.png (512x512 RGBA, produced by make-circle-favicon.ps1)
 * with no dependencies: zlib inflate for the PNG, an alpha-weighted box filter
 * for the three sizes, and a classic 32-bit BGRA ICO container that every
 * browser and file manager understands. Deterministic — same input, same bytes.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "favicon.png");
const OUT = path.join(ROOT, "favicon.ico");
const SIZES = [48, 32, 16];

function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("favicon.png is not a PNG");
  let off = 8, ihdr = null;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      ihdr = { w: body.readUInt32BE(0), h: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (!ihdr) throw new Error("favicon.png has no IHDR");
  if (ihdr.depth !== 8 || ihdr.color !== 6 || ihdr.interlace !== 0) {
    throw new Error("favicon.png must be 8-bit RGBA and non-interlaced (got depth " + ihdr.depth + ", colour type " + ihdr.color + ", interlace " + ihdr.interlace + ")");
  }
  const { w, h } = ihdr;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  if (raw.length < (stride + 1) * h) throw new Error("favicon.png: short IDAT");
  const px = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = px.subarray(y * stride, (y + 1) * stride);
    line.copy(row);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error("favicon.png: unknown filter " + filter + " on row " + y);
      if (add) row[i] = (row[i] + add) & 0xff;
    }
    prev = row;
  }
  return { w, h, px };
}

/* Average in premultiplied space, then un-premultiply: a straight RGB mean
 * would drag the transparent corners' black into the circle's edge. */
function resize(src, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor((y * src.h) / size), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.h) / size));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor((x * src.w) / size), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.w) / size));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.w + sx) * 4, al = src.px[i + 3];
          r += src.px[i] * al; g += src.px[i + 1] * al; b += src.px[i + 2] * al; a += al; n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* One BITMAPINFOHEADER + bottom-up BGRA rows + an all-zero AND mask.
 * biHeight is doubled because the mask counts as half the bitmap. */
function dib(rgba, size) {
  const maskStride = Math.ceil(size / 8 / 4) * 4;
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(size, 4);
  head.writeInt32LE(size * 2, 8);
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(32, 14);
  head.writeUInt32LE(0, 16);
  head.writeUInt32LE(size * size * 4 + maskStride * size, 20);
  const body = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = ((size - 1 - y) * size + x) * 4, o = (y * size + x) * 4;
      body[o] = rgba[i + 2]; body[o + 1] = rgba[i + 1]; body[o + 2] = rgba[i]; body[o + 3] = rgba[i + 3];
    }
  }
  return Buffer.concat([head, body, Buffer.alloc(maskStride * size)]);
}

const src = decodePng(fs.readFileSync(SRC));
const images = SIZES.map(s => ({ size: s, data: dib(resize(src, s), s) }));
const dir = Buffer.alloc(6 + 16 * images.length);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(images.length, 4);
let offset = dir.length;
images.forEach((img, i) => {
  const e = 6 + 16 * i;
  dir[e] = img.size === 256 ? 0 : img.size;
  dir[e + 1] = img.size === 256 ? 0 : img.size;
  dir[e + 2] = 0;
  dir[e + 3] = 0;
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(img.data.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += img.data.length;
});
const ico = Buffer.concat([dir, ...images.map(i => i.data)]);
const before = fs.existsSync(OUT) ? fs.readFileSync(OUT) : null;
if (before && before.equals(ico)) {
  console.log("  favicon.ico — no change (" + SIZES.join(", ") + " from " + src.w + "x" + src.h + ")");
} else {
  fs.writeFileSync(OUT, ico);
  console.log("→ favicon.ico (" + SIZES.join(" + ") + " px, " + ico.length + " bytes, from favicon.png " + src.w + "x" + src.h + ")");
}

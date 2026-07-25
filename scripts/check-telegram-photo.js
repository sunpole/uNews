#!/usr/bin/env node

import { deflateSync } from "node:zlib";

import { validateImageBytes } from "./lib/image-integrity.js";
import {
  normalizeTelegramPhoto,
  TELEGRAM_PHOTO_LIMITS,
  telegramPhotoIsSafe,
} from "./lib/telegram-photo.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = buildCrcTable();

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[value] = crc >>> 0;
  }
  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function buildPng({ width, height, colorType = 2 }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const rowBytes = width * bytesPerPixel;
  const scanlines = Buffer.alloc(height * (rowBytes + 1));
  for (let row = 0; row < height; row += 1) {
    const offset = row * (rowBytes + 1);
    scanlines[offset] = 0;
    if (colorType === 2 || colorType === 6) {
      for (let column = 0; column < width; column += 1) {
        const pixel = offset + 1 + column * bytesPerPixel;
        scanlines[pixel] = (row * 13 + column * 3) & 0xff;
        scanlines[pixel + 1] = (row * 5 + column * 11) & 0xff;
        scanlines[pixel + 2] = (row * 17 + column * 7) & 0xff;
        if (bytesPerPixel === 4) scanlines[pixel + 3] = 0xff;
      }
    }
  }

  const chunks = [PNG_SIGNATURE, chunk("IHDR", ihdr)];
  if (colorType === 3) chunks.push(chunk("PLTE", Buffer.from([0x20, 0x40, 0x60])));
  chunks.push(chunk("IDAT", deflateSync(scanlines, { level: 9 })));
  chunks.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectFailure(name, fn, expected) {
  try {
    fn();
    throw new Error(`${name}: expected failure`);
  } catch (error) {
    if (!error.message.includes(expected)) {
      throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${error.message}`);
    }
    console.log(`OK ${name}: ${expected}`);
  }
}

let failures = 0;
function run(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

run("M4-sized 1440x8625 PNG becomes Telegram-safe", () => {
  const sourceBuffer = buildPng({ width: 1440, height: 8625, colorType: 2 });
  const sourceSnapshot = Buffer.from(sourceBuffer);
  const validated = validateImageBytes(sourceBuffer, { fileName: "m4.png" });
  assert(!telegramPhotoIsSafe(validated), "M4-sized source should exceed Telegram dimension sum");

  const normalized = normalizeTelegramPhoto(validated, { fileName: "m4.png", label: "M4 fixture" });
  assert(normalized.telegramNormalized === true, "expected normalized flag");
  assert(telegramPhotoIsSafe(normalized), "normalized photo must meet Telegram limits");
  assert(normalized.width + normalized.height <= TELEGRAM_PHOTO_LIMITS.safeDimensionSum, "safe dimension sum was not respected");
  assert(normalized.bytes <= TELEGRAM_PHOTO_LIMITS.maxBytes, "Telegram byte limit was not respected");
  assert(sourceBuffer.equals(sourceSnapshot), "source PNG bytes were mutated");
  assert(normalized.telegramSource.width === 1440 && normalized.telegramSource.height === 8625, "source dimensions were not recorded");

  const sourceRatio = 1440 / 8625;
  const outputRatio = normalized.width / normalized.height;
  assert(Math.abs(sourceRatio - outputRatio) < 0.001, `aspect ratio drifted: ${sourceRatio} -> ${outputRatio}`);
  validateImageBytes(normalized.buffer, { fileName: "m4.png", maxBytes: TELEGRAM_PHOTO_LIMITS.maxBytes });
});

run("safe 1180x1189 M6 PNG stays byte-for-byte unchanged", () => {
  const sourceBuffer = buildPng({ width: 1180, height: 1189, colorType: 6 });
  const validated = validateImageBytes(sourceBuffer, { fileName: "m6.png" });
  assert(telegramPhotoIsSafe(validated), "M6 fixture should already be safe");

  const prepared = normalizeTelegramPhoto(validated, { fileName: "m6.png", label: "M6 fixture" });
  assert(prepared.telegramNormalized === false, "safe source must not be normalized");
  assert(prepared.buffer === validated.buffer, "safe source must preserve the exact Buffer object");
  assert(prepared.buffer.equals(sourceBuffer), "safe source bytes changed");
});

run("unsupported oversized indexed PNG is blocked before Telegram", () => {
  const sourceBuffer = buildPng({ width: 1000, height: 9100, colorType: 3 });
  const validated = validateImageBytes(sourceBuffer, { fileName: "indexed.png" });
  expectFailure(
    "indexed normalization",
    () => normalizeTelegramPhoto(validated, { fileName: "indexed.png", label: "Indexed fixture" }),
    "requires non-interlaced 8-bit RGB/RGBA",
  );
});

if (failures > 0) process.exit(1);
console.log("Telegram photo normalization fixtures passed.");

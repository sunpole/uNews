import path from "node:path";
import { inflateSync } from "node:zlib";

export const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DECODED_PNG_BYTES = 128 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = buildCrcTable();

const FORMAT_BY_EXTENSION = new Map([
  [".png", "png"],
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".gif", "gif"],
  [".webp", "webp"],
]);

const MIME_BY_FORMAT = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

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
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function assertDimensions(label, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    fail(label, `invalid dimensions ${width}x${height}`);
  }
  if (width > 20_000 || height > 20_000) {
    fail(label, `dimensions exceed 20000px: ${width}x${height}`);
  }
  if (Math.max(width / height, height / width) > 20) {
    fail(label, `aspect ratio exceeds 20:1: ${width}x${height}`);
  }
}

export function declaredImageFormat(fileName) {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  const format = FORMAT_BY_EXTENSION.get(extension);
  if (!format) throw new Error(`Unsupported image extension: ${extension || "missing"}`);
  return format;
}

export function detectImageFormat(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) return "jpeg";
  if (buffer.length >= 10) {
    const signature = buffer.subarray(0, 6).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") return "gif";
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "webp";
  return null;
}

function validatePng(buffer, label) {
  let offset = 8;
  let chunkIndex = 0;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let sawPlte = false;
  let sawIdat = false;
  let sawIend = false;
  const idatChunks = [];

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) fail(label, "truncated PNG chunk header");
    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const nextOffset = crcOffset + 4;
    if (nextOffset > buffer.length) fail(label, "truncated PNG chunk");

    const typeBytes = buffer.subarray(typeStart, dataStart);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) fail(label, `invalid PNG chunk type ${JSON.stringify(type)}`);

    const storedCrc = buffer.readUInt32BE(crcOffset);
    const actualCrc = crc32(buffer.subarray(typeStart, dataEnd));
    if (storedCrc !== actualCrc) fail(label, `PNG CRC mismatch in ${type} chunk`);

    if (chunkIndex === 0 && type !== "IHDR") fail(label, "PNG first chunk must be IHDR");
    if (sawIend) fail(label, "PNG contains data after IEND");

    if (type === "IHDR") {
      if (chunkIndex !== 0 || length !== 13) fail(label, "invalid PNG IHDR");
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      const compression = buffer[dataStart + 10];
      const filter = buffer[dataStart + 11];
      const interlace = buffer[dataStart + 12];
      assertDimensions(label, width, height);

      const allowedBitDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        3: new Set([1, 2, 4, 8]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      };
      if (!allowedBitDepths[colorType]?.has(bitDepth)) {
        fail(label, `invalid PNG bit depth ${bitDepth} for color type ${colorType}`);
      }
      if (compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) {
        fail(label, "unsupported PNG compression, filter or interlace method");
      }
    } else if (type === "PLTE") {
      if (sawIdat) fail(label, "PNG PLTE must precede IDAT");
      if (length < 3 || length > 768 || length % 3 !== 0) fail(label, "invalid PNG PLTE length");
      sawPlte = true;
    } else if (type === "IDAT") {
      if (length === 0) fail(label, "empty PNG IDAT chunk");
      sawIdat = true;
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      if (length !== 0) fail(label, "invalid PNG IEND length");
      if (nextOffset !== buffer.length) fail(label, "PNG has trailing bytes after IEND");
      sawIend = true;
    }

    offset = nextOffset;
    chunkIndex += 1;
    if (sawIend) break;
  }

  if (width === null || height === null || !sawIdat || !sawIend) {
    fail(label, "incomplete PNG structure");
  }
  if (colorType === 3 && !sawPlte) fail(label, "indexed PNG is missing PLTE");

  try {
    const decoded = inflateSync(Buffer.concat(idatChunks), { maxOutputLength: MAX_DECODED_PNG_BYTES });
    if (decoded.length === 0) fail(label, "PNG decoded data is empty");
  } catch (error) {
    if (error.message.startsWith(`${label}:`)) throw error;
    fail(label, `PNG zlib decode failed: ${error.message}`);
  }

  return { width, height, bitDepth, colorType };
}

function validateJpeg(buffer, label) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) fail(label, "invalid JPEG SOI");
  if (buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) fail(label, "invalid JPEG EOI");

  let offset = 2;
  let width = null;
  let height = null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset < buffer.length - 2) {
    if (buffer[offset] !== 0xff) fail(label, `invalid JPEG marker at byte ${offset}`);
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9) break;
    if (marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) fail(label, "truncated JPEG segment length");
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) fail(label, "invalid JPEG segment length");

    if (sofMarkers.has(marker)) {
      if (length < 7) fail(label, "truncated JPEG SOF segment");
      height = buffer.readUInt16BE(offset + 3);
      width = buffer.readUInt16BE(offset + 5);
      assertDimensions(label, width, height);
    }
    offset += length;
  }

  if (width === null || height === null) fail(label, "JPEG dimensions were not found");
  return { width, height };
}

function validateGif(buffer, label) {
  if (buffer.length < 14) fail(label, "GIF is truncated");
  const signature = buffer.subarray(0, 6).toString("ascii");
  if (signature !== "GIF87a" && signature !== "GIF89a") fail(label, "invalid GIF signature");
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  assertDimensions(label, width, height);
  if (buffer[buffer.length - 1] !== 0x3b) fail(label, "GIF trailer is missing");
  return { width, height };
}

function validateWebp(buffer, label) {
  if (buffer.length < 20) fail(label, "WebP is truncated");
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WEBP") {
    fail(label, "invalid WebP RIFF signature");
  }
  const declaredSize = buffer.readUInt32LE(4) + 8;
  if (declaredSize !== buffer.length) fail(label, `WebP RIFF size mismatch: ${declaredSize} != ${buffer.length}`);
  return {};
}

export function validateImageBytes(input, { fileName = "image", label = fileName, maxBytes = DEFAULT_MAX_IMAGE_BYTES } = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length === 0) fail(label, "image is empty");
  if (buffer.length > maxBytes) fail(label, `image exceeds ${maxBytes} bytes`);

  const expectedFormat = declaredImageFormat(fileName);
  const detectedFormat = detectImageFormat(buffer);
  if (!detectedFormat) fail(label, "unrecognized image format");
  if (detectedFormat !== expectedFormat) {
    fail(label, `extension declares ${expectedFormat}, bytes are ${detectedFormat}`);
  }

  let dimensions = {};
  if (detectedFormat === "png") dimensions = validatePng(buffer, label);
  else if (detectedFormat === "jpeg") dimensions = validateJpeg(buffer, label);
  else if (detectedFormat === "gif") dimensions = validateGif(buffer, label);
  else if (detectedFormat === "webp") dimensions = validateWebp(buffer, label);

  return {
    buffer,
    bytes: buffer.length,
    format: detectedFormat,
    mimeType: MIME_BY_FORMAT[detectedFormat],
    ...dimensions,
  };
}

export async function fetchValidatedImage(url, {
  fileName,
  label = fileName || url,
  fetchImpl = globalThis.fetch,
  maxBytes = DEFAULT_MAX_IMAGE_BYTES,
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, { method: "GET" });
  } catch (error) {
    fail(label, `image download failed: ${error.message}`);
  }
  if (!response?.ok) fail(label, `image download failed with HTTP ${response?.status ?? "unknown"}`);

  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    fail(label, `remote image exceeds ${maxBytes} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const validated = validateImageBytes(buffer, { fileName, label, maxBytes });
  return {
    ...validated,
    url,
    contentType: response.headers?.get?.("content-type") || null,
  };
}

export function validatedImageBlob(validated) {
  return new Blob([validated.buffer], { type: validated.mimeType });
}

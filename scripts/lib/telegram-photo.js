import { deflateSync, inflateSync } from "node:zlib";

import { validateImageBytes } from "./image-integrity.js";

export const TELEGRAM_PHOTO_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxDimensionSum: 10_000,
  safeDimensionSum: 9_800,
  maxAspectRatio: 20,
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DECODED_BYTES = 192 * 1024 * 1024;
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

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function dimensionsAreSafe(width, height, limits = TELEGRAM_PHOTO_LIMITS) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return false;
  return width + height <= limits.maxDimensionSum
    && Math.max(width / height, height / width) <= limits.maxAspectRatio;
}

export function telegramPhotoIsSafe(validated, limits = TELEGRAM_PHOTO_LIMITS) {
  return Boolean(
    validated
    && Buffer.isBuffer(validated.buffer)
    && validated.buffer.length <= limits.maxBytes
    && dimensionsAreSafe(validated.width, validated.height, limits),
  );
}

function parsePng(buffer, label) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(label, "expected validated PNG bytes");
  }

  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const idat = [];

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) fail(label, "truncated PNG while preparing Telegram photo");
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) fail(label, "truncated PNG while preparing Telegram photo");

    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || idat.length === 0) fail(label, "incomplete PNG structure");
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    fail(
      label,
      `oversized PNG cannot be normalized safely: requires non-interlaced 8-bit RGB/RGBA, got bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`,
    );
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    bytesPerPixel: colorType === 6 ? 4 : 3,
    compressed: Buffer.concat(idat),
  };
}

function paethPredictor(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function unfilterPngRows(parsed, label) {
  const rowBytes = parsed.width * parsed.bytesPerPixel;
  const expectedBytes = parsed.height * (rowBytes + 1);
  let encoded;
  try {
    encoded = inflateSync(parsed.compressed, { maxOutputLength: MAX_DECODED_BYTES });
  } catch (error) {
    fail(label, `PNG zlib decode failed during Telegram normalization: ${error.message}`);
  }
  if (encoded.length !== expectedBytes) {
    fail(label, `decoded PNG size mismatch: ${encoded.length} != ${expectedBytes}`);
  }

  const pixels = Buffer.allocUnsafe(parsed.height * rowBytes);
  for (let row = 0; row < parsed.height; row += 1) {
    const encodedOffset = row * (rowBytes + 1);
    const filter = encoded[encodedOffset];
    const source = encoded.subarray(encodedOffset + 1, encodedOffset + 1 + rowBytes);
    const targetOffset = row * rowBytes;

    for (let columnByte = 0; columnByte < rowBytes; columnByte += 1) {
      const left = columnByte >= parsed.bytesPerPixel
        ? pixels[targetOffset + columnByte - parsed.bytesPerPixel]
        : 0;
      const up = row > 0 ? pixels[targetOffset + columnByte - rowBytes] : 0;
      const upperLeft = row > 0 && columnByte >= parsed.bytesPerPixel
        ? pixels[targetOffset + columnByte - rowBytes - parsed.bytesPerPixel]
        : 0;

      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
      else if (filter !== 0) fail(label, `unsupported PNG row filter ${filter}`);

      pixels[targetOffset + columnByte] = (source[columnByte] + predictor) & 0xff;
    }
  }
  return pixels;
}

function resizeNearestNeighbor(source, {
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  bytesPerPixel,
}) {
  const output = Buffer.allocUnsafe(targetWidth * targetHeight * bytesPerPixel);
  const sourceXOffsets = new Uint32Array(targetWidth);
  for (let targetX = 0; targetX < targetWidth; targetX += 1) {
    sourceXOffsets[targetX] = Math.min(
      sourceWidth - 1,
      Math.floor(targetX * sourceWidth / targetWidth),
    ) * bytesPerPixel;
  }

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(targetY * sourceHeight / targetHeight));
    const sourceRowOffset = sourceY * sourceWidth * bytesPerPixel;
    const targetRowOffset = targetY * targetWidth * bytesPerPixel;

    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceOffset = sourceRowOffset + sourceXOffsets[targetX];
      const targetOffset = targetRowOffset + targetX * bytesPerPixel;
      output[targetOffset] = source[sourceOffset];
      output[targetOffset + 1] = source[sourceOffset + 1];
      output[targetOffset + 2] = source[sourceOffset + 2];
      if (bytesPerPixel === 4) output[targetOffset + 3] = source[sourceOffset + 3];
    }
  }
  return output;
}

function encodePng({ width, height, colorType, bytesPerPixel, pixels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = width * bytesPerPixel;
  const scanlines = Buffer.allocUnsafe(height * (rowBytes + 1));
  for (let row = 0; row < height; row += 1) {
    const scanlineOffset = row * (rowBytes + 1);
    scanlines[scanlineOffset] = 0;
    pixels.copy(scanlines, scanlineOffset + 1, row * rowBytes, (row + 1) * rowBytes);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function initialScale(validated, limits) {
  const dimensionScale = limits.safeDimensionSum / (validated.width + validated.height);
  const byteScale = validated.bytes > limits.maxBytes
    ? Math.sqrt(limits.maxBytes / validated.bytes) * 0.9
    : 1;
  return Math.min(1, dimensionScale, byteScale);
}

function nextScale(currentScale, candidate, limits) {
  const dimensionScale = limits.safeDimensionSum / (candidate.width + candidate.height);
  const byteScale = candidate.bytes > limits.maxBytes
    ? Math.sqrt(limits.maxBytes / candidate.bytes) * 0.88
    : 0.92;
  return currentScale * Math.min(0.92, dimensionScale, byteScale);
}

export function normalizeTelegramPhoto(validated, {
  fileName = "photo.png",
  label = fileName,
  limits = TELEGRAM_PHOTO_LIMITS,
} = {}) {
  if (!validated || !Buffer.isBuffer(validated.buffer)) {
    fail(label, "validated image bytes are required");
  }

  const aspectRatio = Math.max(validated.width / validated.height, validated.height / validated.width);
  if (!Number.isFinite(aspectRatio) || aspectRatio > limits.maxAspectRatio) {
    fail(label, `Telegram photo aspect ratio exceeds ${limits.maxAspectRatio}:1`);
  }

  if (telegramPhotoIsSafe(validated, limits)) {
    return {
      ...validated,
      telegramNormalized: false,
      telegramSource: Object.freeze({
        bytes: validated.bytes,
        width: validated.width,
        height: validated.height,
      }),
    };
  }

  if (validated.format !== "png") {
    fail(label, `oversized ${validated.format} cannot be normalized without changing the source; provide a Telegram-safe PNG`);
  }

  const parsed = parsePng(validated.buffer, label);
  const sourcePixels = unfilterPngRows(parsed, label);
  let scale = initialScale(validated, limits);

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const targetWidth = Math.max(1, Math.floor(parsed.width * scale));
    const targetHeight = Math.max(1, Math.floor(parsed.height * scale));
    const resized = resizeNearestNeighbor(sourcePixels, {
      sourceWidth: parsed.width,
      sourceHeight: parsed.height,
      targetWidth,
      targetHeight,
      bytesPerPixel: parsed.bytesPerPixel,
    });
    const output = encodePng({
      width: targetWidth,
      height: targetHeight,
      colorType: parsed.colorType,
      bytesPerPixel: parsed.bytesPerPixel,
      pixels: resized,
    });
    const candidate = validateImageBytes(output, {
      fileName,
      label: `${label} normalized Telegram copy`,
      maxBytes: Math.max(limits.maxBytes, output.length),
    });

    if (telegramPhotoIsSafe(candidate, limits)) {
      return {
        ...candidate,
        telegramNormalized: true,
        telegramSource: Object.freeze({
          bytes: validated.bytes,
          width: validated.width,
          height: validated.height,
        }),
        telegramReason: validated.width + validated.height > limits.maxDimensionSum
          ? "dimension-sum"
          : "file-size",
        telegramAttempt: attempt,
      };
    }
    scale = nextScale(scale, candidate, limits);
  }

  fail(label, "could not create a Telegram-safe PNG after 6 resize attempts");
}

export function telegramPhotoSummary(validated) {
  return {
    format: validated.format,
    bytes: validated.bytes,
    width: validated.width ?? null,
    height: validated.height ?? null,
    normalized: Boolean(validated.telegramNormalized),
    source: validated.telegramSource ?? null,
    reason: validated.telegramReason ?? null,
  };
}

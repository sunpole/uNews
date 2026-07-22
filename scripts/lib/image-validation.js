import path from "node:path";

const MIN_IMAGE_BYTES = 64;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const EXPECTED_TYPES = new Map([
  [".png", "png"],
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".gif", "gif"],
  [".webp", "webp"],
]);

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
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }

  if (
    buffer.length >= 4
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[buffer.length - 2] === 0xff
    && buffer[buffer.length - 1] === 0xd9
  ) {
    return "jpeg";
  }

  if (
    buffer.length >= 6
    && (buffer.subarray(0, 6).toString("ascii") === "GIF87a"
      || buffer.subarray(0, 6).toString("ascii") === "GIF89a")
  ) {
    return "gif";
  }

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return "unknown";
}

export function validatePngStructure(buffer, imageName = "PNG image") {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG signature: ${imageName}`);
  }

  let offset = 8;
  let chunkIndex = 0;
  let width = null;
  let height = null;
  let sawIdat = false;
  let sawIend = false;

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      throw new Error(`Truncated PNG chunk header at byte ${offset}: ${imageName}`);
    }

    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    const nextOffset = crcOffset + 4;
    if (nextOffset > buffer.length) {
      throw new Error(`Truncated PNG chunk at byte ${offset}: ${imageName}`);
    }

    const type = buffer.subarray(typeStart, dataStart).toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) {
      throw new Error(`Invalid PNG chunk type ${JSON.stringify(type)} at byte ${offset}: ${imageName}`);
    }

    const expectedCrc = buffer.readUInt32BE(crcOffset);
    const actualCrc = crc32(buffer.subarray(typeStart, dataEnd));
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `PNG CRC mismatch in ${type} chunk: ${imageName}; `
        + `computed ${actualCrc.toString(16).padStart(8, "0")}, `
        + `stored ${expectedCrc.toString(16).padStart(8, "0")}`,
      );
    }

    if (chunkIndex === 0 && type !== "IHDR") {
      throw new Error(`PNG first chunk must be IHDR: ${imageName}`);
    }
    if (type === "IHDR") {
      if (chunkIndex !== 0 || length !== 13) {
        throw new Error(`Invalid PNG IHDR chunk: ${imageName}`);
      }
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      if (width < 1 || height < 1 || width > 20_000 || height > 20_000) {
        throw new Error(`Invalid PNG dimensions ${width}x${height}: ${imageName}`);
      }
      const ratio = Math.max(width / height, height / width);
      if (ratio > 20) {
        throw new Error(`PNG aspect ratio exceeds 20:1 (${width}x${height}): ${imageName}`);
      }
    } else if (type === "IDAT") {
      sawIdat = true;
    } else if (type === "IEND") {
      if (length !== 0) throw new Error(`PNG IEND chunk must be empty: ${imageName}`);
      sawIend = true;
      if (nextOffset !== buffer.length) {
        throw new Error(`Unexpected bytes after PNG IEND chunk: ${imageName}`);
      }
    }

    offset = nextOffset;
    chunkIndex += 1;
    if (sawIend) break;
  }

  if (width === null || height === null) throw new Error(`PNG has no IHDR chunk: ${imageName}`);
  if (!sawIdat) throw new Error(`PNG has no IDAT chunk: ${imageName}`);
  if (!sawIend) throw new Error(`PNG has no IEND chunk: ${imageName}`);

  return { width, height, chunks: chunkIndex };
}

function validateWebpStructure(buffer, imageName) {
  if (buffer.length < 12) throw new Error(`Truncated WebP file: ${imageName}`);
  const declaredRiffSize = buffer.readUInt32LE(4) + 8;
  if (declaredRiffSize > buffer.length) {
    throw new Error(`Truncated WebP RIFF payload: ${imageName}`);
  }
}

export function assertImageBufferMatchesName(buffer, imageName) {
  const extension = path.extname(String(imageName)).toLowerCase();
  const expectedType = EXPECTED_TYPES.get(extension);
  if (!expectedType) {
    throw new Error(`Unsupported image extension: ${imageName}`);
  }

  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length < MIN_IMAGE_BYTES) {
    throw new Error(`Image is unexpectedly small (${buffer.length} bytes): ${imageName}`);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (${buffer.length} bytes): ${imageName}`);
  }

  const actualType = detectImageType(buffer);
  if (actualType !== expectedType) {
    const signature = buffer.subarray(0, Math.min(12, buffer.length)).toString("hex") || "empty";
    throw new Error(
      `Image signature mismatch: ${imageName} declares ${expectedType}, `
      + `detected ${actualType}, first bytes ${signature}`,
    );
  }

  let dimensions = null;
  if (actualType === "png") dimensions = validatePngStructure(buffer, imageName);
  if (actualType === "webp") validateWebpStructure(buffer, imageName);

  return {
    imageName,
    type: actualType,
    bytes: buffer.length,
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
  };
}

export async function fetchAndValidateRemoteImage(url, imageName, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "image/png,image/jpeg,image/gif,image/webp,application/octet-stream;q=0.8",
      "User-Agent": "uNews-image-validator",
    },
  });
  if (!response.ok) {
    throw new Error(`Image is not available (${response.status}): ${imageName}`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (${declaredLength} bytes): ${imageName}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return assertImageBufferMatchesName(buffer, imageName);
}

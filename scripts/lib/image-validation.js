import path from "node:path";

const MIN_IMAGE_BYTES = 64;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const EXPECTED_TYPES = new Map([
  [".png", "png"],
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".gif", "gif"],
  [".webp", "webp"],
]);

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);

  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
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

  return {
    imageName,
    type: actualType,
    bytes: buffer.length,
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

#!/usr/bin/env node

import { deflateSync } from "node:zlib";

import {
  fetchValidatedImage,
  validateImageBytes,
} from "./lib/image-integrity.js";

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

function buildIndexedPng({ idat = null } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const plte = Buffer.from([0x10, 0x20, 0x30]);
  const compressed = idat || deflateSync(Buffer.from([0x00, 0x00]));
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function corruptPlteData(png) {
  const output = Buffer.from(png);
  const marker = output.indexOf(Buffer.from("PLTE", "ascii"));
  if (marker < 0) throw new Error("PLTE fixture marker was not found");
  output[marker + 4] ^= 0xff;
  return output;
}

async function expectFailure(name, fn, expected) {
  try {
    await fn();
    throw new Error("fixture passed but should have failed");
  } catch (error) {
    if (!error.message.includes(expected)) {
      throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${error.message}`);
    }
    console.log(`OK ${name}: ${expected}`);
  }
}

let failures = 0;
async function run(name, fn) {
  try {
    await fn();
    console.log(`OK ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

const validPng = buildIndexedPng();

await run("valid indexed PNG", async () => {
  const result = validateImageBytes(validPng, { fileName: "valid.png" });
  if (result.format !== "png" || result.width !== 1 || result.height !== 1) {
    throw new Error(`unexpected result ${JSON.stringify(result)}`);
  }
});

await run("real PLTE CRC failure is rejected", async () => {
  await expectFailure(
    "PLTE CRC",
    () => validateImageBytes(corruptPlteData(validPng), { fileName: "broken.png" }),
    "PNG CRC mismatch in PLTE chunk",
  );
});

await run("valid CRC but broken zlib stream is rejected", async () => {
  const brokenZlib = buildIndexedPng({ idat: Buffer.from([0x00, 0x01, 0x02, 0x03]) });
  await expectFailure(
    "PNG zlib",
    () => validateImageBytes(brokenZlib, { fileName: "broken.png" }),
    "PNG zlib decode failed",
  );
});

await run("extension mismatch is rejected", async () => {
  await expectFailure(
    "extension mismatch",
    () => validateImageBytes(validPng, { fileName: "wrong.jpg" }),
    "extension declares jpeg, bytes are png",
  );
});

await run("trailing bytes after IEND are rejected", async () => {
  await expectFailure(
    "PNG trailing bytes",
    () => validateImageBytes(Buffer.concat([validPng, Buffer.from("extra")]), { fileName: "trailing.png" }),
    "PNG has trailing bytes after IEND",
  );
});

await run("GET fetch returns validated bytes", async () => {
  let requestedMethod = null;
  const fetchImpl = async (_url, options) => {
    requestedMethod = options?.method;
    return new Response(validPng, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(validPng.length),
      },
    });
  };
  const result = await fetchValidatedImage("https://example.test/valid.png", {
    fileName: "valid.png",
    fetchImpl,
  });
  if (requestedMethod !== "GET") throw new Error(`expected GET, got ${requestedMethod}`);
  if (!result.buffer.equals(validPng) || result.mimeType !== "image/png") {
    throw new Error("validated remote bytes were not preserved");
  }
});

await run("HTTP failure is reported safely", async () => {
  await expectFailure(
    "HTTP failure",
    () => fetchValidatedImage("https://example.test/missing.png", {
      fileName: "missing.png",
      fetchImpl: async () => new Response("missing", { status: 404 }),
    }),
    "image download failed with HTTP 404",
  );
});

await run("remote content-length limit is enforced", async () => {
  await expectFailure(
    "content length",
    () => fetchValidatedImage("https://example.test/large.png", {
      fileName: "large.png",
      maxBytes: 100,
      fetchImpl: async () => new Response(validPng, {
        status: 200,
        headers: { "content-length": "101" },
      }),
    }),
    "remote image exceeds 100 bytes",
  );
});

if (failures > 0) process.exit(1);
console.log("Image integrity fixtures passed.");

const FILE_SIZE = 4096;
const STREAM_WORDS = 512;

export function usersvCrc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xa001 : 0);
  }
  return crc;
}

function wordOffsets(): number[] {
  return [0, 4, 8, ...Array.from({ length: 1020 }, (_, i) => 16 + i * 4)];
}

/** The native exporter zero-fills its unused final 2048 bytes. Their encrypted
 * words reveal one complete repeating XOR stream, avoiding a bundled game key. */
export function decodeUsersv(original: Buffer): Buffer {
  if (original.length !== FILE_SIZE) throw new Error("Unsupported usersv length");
  const offsets = wordOffsets();
  const stream = new Uint32Array(STREAM_WORDS);
  for (let index = offsets.length - STREAM_WORDS; index < offsets.length; index++) {
    stream[index % STREAM_WORDS] = original.readUInt32LE(offsets[index]!);
  }
  const decoded = Buffer.from(original);
  offsets.forEach((offset, index) => decoded.writeUInt32LE((original.readUInt32LE(offset) ^ stream[index % STREAM_WORDS]!) >>> 0, offset));
  if (decoded.toString("ascii", 0, 4) !== "MGSS") throw new Error("Unsupported usersv signature");
  if (decoded.readUInt16LE(4) !== usersvCrc16(decoded.subarray(16))) throw new Error("usersv checksum does not match");
  return decoded;
}

export function editUsersv(original: Buffer, changes: ReadonlyMap<number, number>): Buffer {
  const decoded = decodeUsersv(original);
  const updated = Buffer.from(decoded);
  for (const [index, value] of changes) {
    if (!Number.isInteger(index) || index < 0 || index >= 256 || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      throw new Error("Invalid usersv field or value");
    }
    updated.writeInt32LE(value, 16 + index * 4);
  }
  updated.writeUInt16LE(usersvCrc16(updated.subarray(16)), 4);
  // Retain the original seed, padding and every unrelated field.
  const encrypted = Buffer.from(original);
  for (const offset of wordOffsets()) {
    encrypted.writeUInt32LE((original.readUInt32LE(offset) ^ decoded.readUInt32LE(offset) ^ updated.readUInt32LE(offset)) >>> 0, offset);
  }
  return encrypted;
}

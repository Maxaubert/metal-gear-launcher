import { createHash } from "node:crypto";

// Derived from the installed struct_systemdata_titles schema: common + 12 titles.
// The complete schema size and initialized version headers were checked against
// the native save. These are not offsets inferred from changing arbitrary bytes.
export const MGS1_BLOCK_SIZE = 1_361_152;
export const MGS1_PAYLOAD_SIZE = 13 * MGS1_BLOCK_SIZE;

function psbArray(buffer: Buffer, offset: number): number[] {
  const countWidth = (buffer[offset] ?? 0) - 0x0c;
  if (offset < 44 || countWidth < 1 || countWidth > 4 || offset + countWidth + 2 > buffer.length) throw new Error("Invalid MGS1 metadata array");
  const count = buffer.readUIntLE(offset + 1, countWidth);
  const width = (buffer[offset + 1 + countWidth] ?? 0) - 0x0c;
  const start = offset + countWidth + 2;
  if (count > 1024 || width < 1 || width > 4 || start + count * width > buffer.length) throw new Error("Invalid MGS1 metadata array bounds");
  return Array.from({ length: count }, (_, index) => buffer.readUIntLE(start + index * width, width));
}

export function mgs1DigestOffset(metadata: Buffer): number {
  // PSB v3 header and chunk arrays follow FreeMote's PsbHeader/PsbArray format.
  if (metadata.length < 60 || metadata.length > 64 * 1024 || metadata.toString("ascii", 0, 4) !== "PSB\0"
    || metadata.readUInt16LE(4) !== 3 || metadata.readUInt16LE(6) !== 0) throw new Error("Unsupported MGS1 PSB metadata");
  const offsets = psbArray(metadata, metadata.readUInt32LE(24));
  const lengths = psbArray(metadata, metadata.readUInt32LE(28));
  const chunkStart = metadata.readUInt32LE(32);
  if (offsets.length !== 1 || lengths.length !== 1 || lengths[0] !== 16) throw new Error("Unsupported MGS1 digest resource");
  const digestOffset = chunkStart + offsets[0]!;
  if (chunkStart < 44 || digestOffset + 16 > metadata.length) throw new Error("Invalid MGS1 digest bounds");
  return digestOffset;
}

export function decodeMgs1Save(original: Buffer): { payload: Buffer; metadata: Buffer; digestOffset: number } {
  if (original.length < 8 || original.readUInt32LE(0) !== MGS1_PAYLOAD_SIZE) throw new Error("Unsupported MGS1 payload length");
  const metadataLength = original.readUInt32LE(4);
  if (original.length !== 8 + MGS1_PAYLOAD_SIZE + metadataLength) throw new Error("Invalid MGS1 save length");
  const payload = original.subarray(8, 8 + MGS1_PAYLOAD_SIZE);
  const metadata = original.subarray(8 + MGS1_PAYLOAD_SIZE);
  const digestOffset = mgs1DigestOffset(metadata);
  if (!createHash("md5").update(payload).digest().equals(metadata.subarray(digestOffset, digestOffset + 16))) throw new Error("MGS1 save checksum mismatch");
  if (payload.readUInt32LE(0) !== 0x00010014) throw new Error("Unsupported MGS1 common settings version");
  for (let title = 1; title <= 12; title++) {
    const version = payload.readUInt32LE(title * MGS1_BLOCK_SIZE);
    if (version !== 0 && version !== 0x0001001f) throw new Error("Unsupported MGS1 title settings version");
  }
  return { payload, metadata, digestOffset };
}

export function updateMgs1Save(original: Buffer, values: { offset: number; width: 1 | 4; value: number }[]): Buffer {
  const { digestOffset } = decodeMgs1Save(original);
  const updated = Buffer.from(original);
  for (const field of values) {
    if (!Number.isSafeInteger(field.offset) || field.offset < 4160 || field.offset + field.width > 4672
      || !Number.isSafeInteger(field.value) || field.value < 0 || (field.width !== 1 && field.width !== 4)
      || field.value > (field.width === 1 ? 255 : 0xffffffff)) throw new Error("Invalid MGS1 settings write");
    updated.writeUIntLE(field.value, 8 + field.offset, field.width);
  }
  createHash("md5").update(updated.subarray(8, 8 + MGS1_PAYLOAD_SIZE)).digest().copy(updated, 8 + MGS1_PAYLOAD_SIZE + digestOffset);
  return updated;
}

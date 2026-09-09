/** The collection stores streamed music in length-prefixed Konami SDT blocks. */
export function unpackSdtMusic(input: Buffer, codec: "mtaf" | "psx"): Buffer {
  if (input.length < 32 || input.length > 64 * 1024 * 1024) throw new Error("Invalid music stream size");
  const chunks: Buffer[] = [];
  let offset = 0;
  let count = 0;
  const audioType = codec === "mtaf" ? 0x110001 : 1;
  while (offset < input.length) {
    if (++count > 20000 || offset + 16 > input.length) throw new Error("Truncated music block");
    const type = input.readUInt32LE(offset);
    const length = input.readUInt32LE(offset + 4);
    if (length < 16 || length > 65536 || offset + length > input.length) throw new Error("Invalid music block length");
    // PSX's first type-1 block describes the stream. Its 16-byte payload is not an ADPCM frame.
    const formatHeader = codec === "psx" && type === 1 && length === 32 && chunks.length === 0
      && input.subarray(offset + 16, offset + length).includes(Buffer.from([0x7f, 0xac, 0x44, 2]));
    if (type === audioType && !formatHeader) chunks.push(input.subarray(offset + 16, offset + length));
    offset += length;
  }
  const result = Buffer.concat(chunks);
  if (codec === "mtaf") {
    if (result.length < 0x800 || result.toString("ascii", 0, 4) !== "MTAF"
      || result.toString("ascii", 0x40, 0x44) !== "HEAD" || result.readUInt32LE(0x44) !== 0xb0
      || result.toString("ascii", 0x7f8, 0x7fc) !== "DATA" || result.readUInt32LE(0x60) !== 0x110) {
      throw new Error("Unsupported MTAF music stream");
    }
    const samples = result.readUInt32LE(0x5c);
    if (samples < 48000 || samples > 48000 * 600 || Math.ceil(samples / 256) * 0x110 > result.length - 0x800) {
      throw new Error("Incomplete MTAF music stream");
    }
  } else {
    // The verified opening uses 44.1 kHz stereo PS-ADPCM with 0x800-byte channel interleave.
    // Reject other codecs (including XWMA) instead of decoding them into loud noise.
    if (!input.subarray(0, 0x400).includes(Buffer.from([0x7f, 0xac, 0x44, 2]))
      || result.length < 0x1000 || result.length % 0x1000 !== 0
      || result.length / 16 * 14 > 44100 * 600) throw new Error("Unsupported opening audio format");
    for (let frame = 0; frame < result.length; frame += 16) {
      if (result[frame]! >> 4 > 4 || (result[frame]! & 15) > 12 || result[frame + 1]! > 7) {
        throw new Error("Opening audio is not PS-ADPCM");
      }
    }
  }
  return result;
}

export const OPENING_TXTH = "codec = PSX\nsample_rate = 44100\nchannels = 2\ninterleave = 0x800\nnum_samples = data_size\n";

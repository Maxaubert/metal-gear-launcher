const MAX_BYTES = 4 * 1024 * 1024;
const ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
const invalid = (): never => { throw new Error("Unsupported or damaged native menu sound"); };

/** FreeMote preserves MS ADPCM; WebAudio receives ordinary PCM16 without an external converter. */
export function nativeWav(bytes: Buffer): Buffer {
  if (bytes.length < 44 || bytes.length > MAX_BYTES || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") invalid();
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) invalid();
  let format: Buffer | undefined; let data: Buffer | undefined; let frames: number | undefined;
  let offset = 12;
  for (; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4); const end = offset + 8 + size;
    if (end + (size % 2) > bytes.length) invalid();
    const name = bytes.toString("ascii", offset, offset + 4); const chunk = bytes.subarray(offset + 8, end);
    if (name === "fmt ") format = chunk;
    if (name === "data") data = chunk;
    if (name === "fact" && size >= 4) frames = chunk.readUInt32LE(0);
    offset = end + (size % 2);
  }
  if (offset !== bytes.length) invalid();
  if (!format || format.length < 16 || !data?.length) invalid();
  const fmt = format!; const source = data!;
  const codec = fmt.readUInt16LE(0); const channels = fmt.readUInt16LE(2);
  const rate = fmt.readUInt32LE(4); const blockSize = fmt.readUInt16LE(12); const bits = fmt.readUInt16LE(14);
  if (channels < 1 || channels > 8 || rate < 8000 || rate > 192000) invalid();
  const linear = (codec === 1 && [8, 16, 24, 32].includes(bits)) || (codec === 3 && [32, 64].includes(bits));
  if (linear && blockSize === channels * bits / 8 && source.length % blockSize === 0) return bytes;
  if (codec !== 2 || channels > 2 || bits !== 4 || fmt.length < 22 || blockSize <= channels * 7) invalid();
  const perBlock = fmt.readUInt16LE(18); const count = fmt.readUInt16LE(20);
  if (!count || count > 256 || fmt.length < 22 + count * 4 || perBlock !== 2 + (blockSize - channels * 7) * 2 / channels) invalid();
  const coefficients = Array.from({ length: count }, (_, index) => [fmt.readInt16LE(22 + index * 4), fmt.readInt16LE(24 + index * 4)] as const);
  const capacity = Math.ceil(source.length / blockSize) * perBlock;
  const outputFrames = frames ?? capacity;
  if (!outputFrames || outputFrames > capacity || outputFrames * channels * 2 > MAX_BYTES) invalid();
  const pcm = Buffer.alloc(outputFrames * channels * 2); let written = 0;
  const emit = (values: number[]): void => { for (const value of values) { if (written < pcm.length) { pcm.writeInt16LE(value, written); written += 2; } } };
  for (let start = 0; start < source.length && written < pcm.length; start += blockSize) {
    const block = source.subarray(start, Math.min(start + blockSize, source.length));
    if (block.length < channels * 7) invalid();
    const state = Array.from({ length: channels }, (_, channel) => {
      const predictor = block[channel]!; if (predictor >= coefficients.length) invalid();
      const delta = block.readInt16LE(channels + channel * 2); if (delta < 0) invalid();
      return { coefficients: coefficients[predictor]!, delta, one: block.readInt16LE(channels * 3 + channel * 2), two: block.readInt16LE(channels * 5 + channel * 2) };
    });
    emit(state.map(value => value.two)); emit(state.map(value => value.one));
    const sample = (channel: number, nibble: number): number => {
      const current = state[channel]!;
      const prediction = Math.trunc((current.one * current.coefficients[0] + current.two * current.coefficients[1]) / 256);
      const value = Math.max(-32768, Math.min(32767, prediction + (nibble >= 8 ? nibble - 16 : nibble) * current.delta));
      current.two = current.one; current.one = value; current.delta = Math.max(16, Math.floor(ADAPT[nibble]! * current.delta / 256));
      if (!Number.isSafeInteger(current.delta)) invalid();
      return value;
    };
    for (let index = channels * 7; index < block.length && written < pcm.length; index++) {
      const value = block[index]!;
      emit(channels === 2 ? [sample(0, value >> 4), sample(1, value & 15)] : [sample(0, value >> 4), sample(0, value & 15)]);
    }
  }
  if (written !== pcm.length) invalid();
  const header = Buffer.alloc(44); header.write("RIFF"); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

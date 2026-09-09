import { expect, it } from "vitest";
import { nativeWav } from "../electron/main/music/nativeWav";

function chunk(name: string, value: Buffer): Buffer {
  const header = Buffer.alloc(8); header.write(name); header.writeUInt32LE(value.length, 4);
  return Buffer.concat([header, value, Buffer.alloc(value.length % 2)]);
}
function adpcm(channels = 1, frames = 4): Buffer {
  const format = Buffer.alloc(26); format.writeUInt16LE(2); format.writeUInt16LE(channels, 2); format.writeUInt32LE(44100, 4);
  format.writeUInt16LE(channels * 7 + channels, 12); format.writeUInt16LE(4, 14); format.writeUInt16LE(8, 16);
  format.writeUInt16LE(4, 18); format.writeUInt16LE(1, 20); format.writeInt16LE(256, 22);
  const block = Buffer.alloc(channels * 8);
  for (let channel = 0; channel < channels; channel++) {
    block.writeInt16LE(16, channels + channel * 2); block.writeInt16LE(100, channels * 3 + channel * 2); block.writeInt16LE(50, channels * 5 + channel * 2);
  }
  block.fill(channels === 1 ? 0x1f : 0x12, channels * 7);
  const fact = Buffer.alloc(4); fact.writeUInt32LE(frames);
  const body = Buffer.concat([Buffer.from("WAVE"), chunk("fmt ", format), chunk("fact", fact), chunk("data", block)]);
  const header = Buffer.alloc(8); header.write("RIFF"); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

it("decodes mono MS ADPCM predictors and positive/negative nibbles into PCM16", () => {
  const output = nativeWav(adpcm());
  expect(output.readUInt16LE(20)).toBe(1);
  expect([0, 1, 2, 3].map(index => output.readInt16LE(44 + index * 2))).toEqual([50, 100, 116, 100]);
  expect(nativeWav(output)).toBe(output);
});
it("interleaves stereo nibbles and honors the fact sample count", () => {
  const output = nativeWav(adpcm(2, 3));
  expect(output.length).toBe(44 + 3 * 2 * 2);
  expect([0, 1, 2, 3, 4, 5].map(index => output.readInt16LE(44 + index * 2))).toEqual([50, 50, 100, 100, 116, 132]);
});
it("rejects truncated chunks, unsupported codecs, and impossible sample counts", () => {
  expect(() => nativeWav(adpcm().subarray(0, 30))).toThrow();
  const unsupported = adpcm(); unsupported.writeUInt16LE(85, 20); expect(() => nativeWav(unsupported)).toThrow();
  expect(() => nativeWav(adpcm(1, 10000))).toThrow();
  const wrongSize = adpcm(); wrongSize.writeUInt32LE(1, 4); expect(() => nativeWav(wrongSize)).toThrow();
  const trailing = Buffer.concat([adpcm(), Buffer.alloc(3)]); trailing.writeUInt32LE(trailing.length - 8, 4); expect(() => nativeWav(trailing)).toThrow();
});
it("preserves correctly aligned PCM24 and float32 custom WAVs", () => {
  for (const [codec, bits] of [[1, 24], [3, 32]]) {
    const fmt = Buffer.alloc(16); fmt.writeUInt16LE(codec!, 0); fmt.writeUInt16LE(2, 2); fmt.writeUInt32LE(44100, 4);
    fmt.writeUInt16LE(bits! / 4, 12); fmt.writeUInt16LE(bits!, 14);
    const body = Buffer.concat([Buffer.from("WAVE"), chunk("fmt ", fmt), chunk("data", Buffer.alloc(bits! / 4))]);
    const header = Buffer.alloc(8); header.write("RIFF"); header.writeUInt32LE(body.length, 4);
    const wave = Buffer.concat([header, body]); expect(nativeWav(wave)).toBe(wave);
    const malformed = Buffer.from(wave); malformed.writeUInt32LE(9999, 40); expect(() => nativeWav(malformed)).toThrow();
  }
});

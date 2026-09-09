import { describe, expect, it } from "vitest";
import { unpackSdtMusic } from "../electron/main/music/sdtMusic";

export function block(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(16); header.writeUInt32LE(type); header.writeUInt32LE(payload.length + 16, 4);
  return Buffer.concat([header, payload]);
}
export function mtafFixture(): Buffer {
  const header = Buffer.alloc(0x800);
  header.write("MTAF"); header.write("HEAD", 0x40); header.writeUInt32LE(0xb0, 0x44);
  header.writeUInt32LE(48000, 0x5c); header.writeUInt32LE(0x110, 0x60); header.write("DATA", 0x7f8);
  const audio = Buffer.alloc(Math.ceil(48000 / 256) * 0x110);
  return Buffer.concat([block(16, Buffer.alloc(0)), block(0x110001, header), block(0x110001, audio)]);
}
describe("game music container validation", () => {
  it("removes framing without inserting metadata or altering music bytes", () => {
    const fixture = mtafFixture();
    const decoded = unpackSdtMusic(fixture, "mtaf");
    expect(decoded.subarray(0, 4).toString()).toBe("MTAF");
    expect(decoded.length).toBe(fixture.length - 48);
  });
  it("excludes the PSX format header and keeps stereo interleave intact", () => {
    const format = Buffer.alloc(16); Buffer.from([127, 172, 68, 2]).copy(format, 5);
    const audio = Buffer.alloc(4096); audio[0] = 12; audio[1] = 2;
    expect(unpackSdtMusic(Buffer.concat([block(16, Buffer.alloc(0)), block(1, format), block(1, audio)]), "psx")).toEqual(audio);
  });
  it("rejects malformed lengths, truncated containers and insufficient sample data", () => {
    const malformed = mtafFixture(); malformed.writeUInt32LE(0, 4);
    expect(() => unpackSdtMusic(malformed, "mtaf")).toThrow("length");
    expect(() => unpackSdtMusic(mtafFixture().subarray(0, -1), "mtaf")).toThrow("length");
    const missingSamples = mtafFixture(); missingSamples.writeUInt32LE(48000 * 100, 32 + 0x5c);
    expect(() => unpackSdtMusic(missingSamples, "mtaf")).toThrow("Incomplete");
  });
  it("rejects unsupported stream channels and non-PSX payloads rather than decoding noise", () => {
    const mtaf = mtafFixture(); mtaf.writeUInt32LE(0x220, 32 + 0x60);
    expect(() => unpackSdtMusic(mtaf, "mtaf")).toThrow("Unsupported");
    const header = Buffer.alloc(16); Buffer.from([127, 172, 68, 2]).copy(header, 5);
    const noise = Buffer.alloc(4096, 255);
    expect(() => unpackSdtMusic(Buffer.concat([block(1, header), block(1, noise)]), "psx")).toThrow("not PS-ADPCM");
  });
});

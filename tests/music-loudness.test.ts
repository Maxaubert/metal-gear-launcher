import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMusicLoudnessAnalyzer } from "../electron/main/music/loudness";
import { LoudnessMeter, LoudnessWavReader } from "../electron/main/music/loudnessDsp";

function tone(seconds: number, amplitude = 0.1, rate = 48000, channels = 1, frequency = 997) {
  const samples = Buffer.alloc(Math.round(seconds * rate) * channels * 4);
  for (let frame = 0; frame < samples.length / (channels * 4); frame++) {
    for (let channel = 0; channel < channels; channel++) {
      samples.writeFloatLE(amplitude * Math.sin(2 * Math.PI * frequency * frame / rate), (frame * channels + channel) * 4);
    }
  }
  return samples;
}
function measure(samples: Buffer, rate = 48000, channels = 1) {
  const meter = new LoudnessMeter(rate, channels); meter.push(samples); return meter.finish();
}
function wav(samples: Buffer) {
  const header = Buffer.alloc(44); header.write("RIFF"); header.writeUInt32LE(samples.length + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(3, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(48000, 24);
  header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(32, 34); header.write("data", 36); header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}
it.each([44100, 48000, 96000])("calibrates a -20 dBFS 997 Hz sine at %i Hz to -23.01 LUFS", rate => {
  const result = measure(tone(2, 0.1, rate), rate)!;
  expect(result.lufs).toBeCloseTo(-23.01, 1); expect(result.peak).toBeCloseTo(0.1, 5);
});
it("sums stereo channel energy and measures a six dB level change", () => {
  expect(measure(tone(2, 0.1, 48000, 2), 48000, 2)!.lufs).toBeCloseTo(-20, 1);
  expect(measure(tone(2, 0.05))!.lufs - measure(tone(2, 0.1))!.lufs).toBeCloseTo(-6.0206, 3);
});
it("gates silence and quiet material instead of averaging silence into music", () => {
  const reference = measure(tone(4))!.lufs;
  const mixed = Buffer.concat([tone(4), tone(4, 0), tone(4, 0.001)]);
  expect(Math.abs(measure(mixed)!.lufs - reference)).toBeLessThan(0.25);
  expect(measure(tone(1, 0))).toBeUndefined(); expect(measure(tone(1, 0.000001))).toBeUndefined();
});
it("applies K weighting rather than unweighted RMS and rejects unsupported channels", () => {
  expect(measure(tone(2, 0.1, 48000, 1, 50))!.lufs).toBeLessThan(measure(tone(2))!.lufs - 4);
  expect(() => new LoudnessMeter(48000, 6)).toThrow();
});
it("reads fragmented float WAV without changing the measurement and rejects truncation", () => {
  const samples = tone(1); const stream = wav(samples); const reader = new LoudnessWavReader();
  for (let offset = 0; offset < stream.length; offset += 79) reader.push(stream.subarray(offset, offset + 79));
  expect(reader.finish()).toEqual(measure(samples));
  const truncated = new LoudnessWavReader(); truncated.push(stream.subarray(0, -1)); expect(() => truncated.finish()).toThrow();
  const invalid = wav(samples); invalid.writeUInt16LE(1, 20); expect(() => new LoudnessWavReader().push(invalid)).toThrow();
  const nan = tone(1); nan.writeFloatLE(NaN, 0); expect(() => measure(nan)).toThrow();
});

let root: string; let file: string; let decoder: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "music-loudness-")); file = join(root, "music.flac"); decoder = join(root, "decoder.exe");
  await writeFile(file, Buffer.alloc(100)); await writeFile(decoder, "decoder");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
it("coalesces concurrent analysis, persists measurements, and invalidates changed sources", async () => {
  const result = { lufs: -19.6, peak: 0.4 }; const decode = vi.fn(async () => result);
  const deps = { decode, decoder: () => decoder }; const analyze = createMusicLoudnessAnalyzer(deps);
  expect(await Promise.all([analyze(root, file), analyze(root, file)])).toEqual([result, result]); expect(decode).toHaveBeenCalledTimes(1);
  expect(await createMusicLoudnessAnalyzer(deps)(root, file)).toEqual(result); expect(decode).toHaveBeenCalledTimes(1);
  await writeFile(file, Buffer.alloc(101)); expect(await analyze(root, file)).toEqual(result); expect(decode).toHaveBeenCalledTimes(2);
  const records = await readdir(join(root, "music-loudness")); expect(records.every(name => name.endsWith(".json"))).toBe(true);
  expect(JSON.parse(await readFile(join(root, "music-loudness", records[0]!), "utf8"))).toEqual(result);
  await Promise.all(records.map(name => writeFile(join(root, "music-loudness", name), "corrupt")));
  expect(await analyze(root, file)).toEqual(result); expect(decode).toHaveBeenCalledTimes(3);
});
it("limits concurrent decoding to two and safely handles invalid audio, failures, and mid-analysis edits", async () => {
  let active = 0; let highest = 0;
  const decode = vi.fn(async () => {
    active++; highest = Math.max(highest, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { lufs: -18, peak: 0.8 };
  });
  const analyze = createMusicLoudnessAnalyzer({ decode, decoder: () => decoder });
  const files = Array.from({ length: 6 }, (_, index) => join(root, `song${index}.flac`));
  await Promise.all(files.map(path => writeFile(path, Buffer.alloc(100))));
  expect((await Promise.all(files.map(path => analyze(root, path)))).every(Boolean)).toBe(true); expect(highest).toBe(2);
  decode.mockRejectedValueOnce(new Error("bad format")); expect(await analyze(root, file)).toBeUndefined();
  decode.mockImplementationOnce(async () => ({ lufs: NaN, peak: 0.5 })); expect(await analyze(root, file)).toBeUndefined();
  decode.mockImplementationOnce(async () => { await writeFile(file, Buffer.alloc(102)); return { lufs: -18, peak: 0.8 }; });
  expect(await analyze(root, file)).toBeUndefined(); expect(await analyze(root, join(root, "missing"))).toBeUndefined();
  await writeFile(file, "short"); const calls = decode.mock.calls.length;
  expect(await analyze(root, file)).toBeUndefined(); expect(decode).toHaveBeenCalledTimes(calls);
});

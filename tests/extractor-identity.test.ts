import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decoderIdentity, extractorIdentity } from "../electron/main/extract/identity";
import { readSnapshot, sourceFingerprint, stampExtractor, writeSnapshot } from "../electron/main/preparation/snapshot";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "extractor-identity-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("keeps extractor and persisted preparation identities stable after installer timestamp changes", async () => {
  const file = join(root, "decoder.exe"); await writeFile(file, "same decoder bytes");
  const identity = await extractorIdentity(file);
  const source = await stampExtractor(file); const fingerprint = sourceFingerprint({}, [source]);
  await writeSnapshot(root, { version: 1, fingerprint, sources: [source], files: [], total: 1 });
  const later = new Date("2030-01-01T00:00:00Z"); await utimes(file, later, later);
  expect(await extractorIdentity(file)).toBe(identity);
  expect(await stampExtractor(file)).toEqual(source);
  expect(sourceFingerprint({}, [await stampExtractor(file)])).toBe(fingerprint);
  expect((await readSnapshot(root))?.sources).toEqual([source]);
});

it("invalidates changed decoder bytes even when size and modification time are restored", async () => {
  const file = join(root, "decoder.exe"); await writeFile(file, "decoder one");
  const past = new Date("2020-01-01T00:00:00Z"); await utimes(file, past, past);
  const before = await stat(file); const identity = await extractorIdentity(file);
  const source = await stampExtractor(file);
  await writeFile(file, "decoder two"); await utimes(file, before.atime, before.mtime);
  expect(await extractorIdentity(file)).not.toBe(identity);
  expect(sourceFingerprint({}, [await stampExtractor(file)])).not.toBe(sourceFingerprint({}, [source]));
});

it("coalesces concurrent hashes and only stats unchanged extractor files on subsequent pages", async () => {
  const file = join(root, "decoder.exe"); await writeFile(file, "decoder");
  vi.mocked(readFile).mockClear();
  const results = await Promise.all(Array.from({ length: 8 }, () => extractorIdentity(file)));
  expect(new Set(results).size).toBe(1); expect(readFile).toHaveBeenCalledTimes(1);
  vi.mocked(readFile).mockClear(); await extractorIdentity(file);
  expect(readFile).not.toHaveBeenCalled();
});

it("allows absent optional extractor VERSION files and retries after a removed file returns", async () => {
  const file = join(root, "VERSION");
  expect(await stampExtractor(file)).toEqual({ file, size: -1, modified: -1 });
  await writeFile(file, "1"); const identity = await extractorIdentity(file);
  await rm(file); await expect(extractorIdentity(file)).rejects.toThrow();
  await writeFile(file, "2"); expect(await extractorIdentity(file)).not.toBe(identity);
});

it("includes the adjacent release VERSION in native decoder cache identities", async () => {
  const file = join(root, "decoder.exe"); const version = join(root, "VERSION");
  await writeFile(file, "unchanged executable");
  const unversioned = await decoderIdentity(file);
  await writeFile(version, "1"); const first = await decoderIdentity(file);
  expect(first).not.toBe(unversioned);
  const later = new Date("2030-01-01T00:00:00Z"); await utimes(version, later, later);
  expect(await decoderIdentity(file)).toBe(first);
  await writeFile(version, "2"); expect(await decoderIdentity(file)).not.toBe(first);
});

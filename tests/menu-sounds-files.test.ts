import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMenuSounds } from "../electron/main/music/sounds";
import { MENU_SOUNDS } from "../shared/menuSounds";

function wav(size = 46): Buffer {
  const bytes = Buffer.alloc(size);
  bytes.write("RIFF");
  bytes.writeUInt32LE(size - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(22050, 24);
  bytes.writeUInt32LE(44100, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(size - 44, 40);
  return bytes;
}

describe("optional local menu sound files", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "hub-sounds-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("returns an empty preload for a fresh machine with no sounds or games", async () => {
    expect(await readMenuSounds(join(root, "not-created"))).toEqual({});
  });

  it("loads every allowed action exactly, without exposing arbitrary neighboring files", async () => {
    await mkdir(join(root, "sounds"));
    const bytes = wav();
    for (const action of MENU_SOUNDS) await writeFile(join(root, "sounds", `${action}.wav`), bytes);
    await writeFile(join(root, "sounds", "secret.wav"), bytes);
    const sounds = await readMenuSounds(root);
    expect(Object.keys(sounds)).toEqual([...MENU_SOUNDS]);
    for (const encoded of Object.values(sounds)) expect(Buffer.from(encoded, "base64")).toEqual(bytes);
  });

  it("skips invalid, oversized and directory entries while preserving valid clips", async () => {
    await mkdir(join(root, "sounds"));
    await writeFile(join(root, "sounds", "navigate.wav"), wav());
    await writeFile(join(root, "sounds", "select.wav"), "not a WAV");
    await writeFile(join(root, "sounds", "back.wav"), "RIFF");
    await writeFile(join(root, "sounds", "options.wav"), wav(4 * 1024 * 1024 + 1));
    await mkdir(join(root, "sounds", "adjust.wav"));
    expect(await readMenuSounds(root)).toEqual({ navigate: wav().toString("base64") });
  });

  it("rejects a sounds junction that escapes the data root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "hub-sounds-outside-"));
    try {
      await writeFile(join(outside, "select.wav"), wav());
      await symlink(outside, join(root, "sounds"), "junction");
      expect(await readMenuSounds(root)).toEqual({});
    } finally {
      await rm(join(root, "sounds"), { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects a sounds junction redirected to a different folder inside the root", async () => {
    await mkdir(join(root, "other"));
    await writeFile(join(root, "other", "select.wav"), wav());
    await symlink(join(root, "other"), join(root, "sounds"), "junction");
    expect(await readMenuSounds(root)).toEqual({});
    await rm(join(root, "sounds"), { force: true });
  });
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
import { mkdir, mkdtemp, readFile, readdir, rm, rmdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPacks } from "../shared/packs";
import { createGameSoundtrackReader } from "../electron/main/music/gameSoundtracks";
import { resolveBonusFile } from "../electron/main/bonus/media";

function fixture(): Buffer {
  const header = Buffer.alloc(0x800); header.write("MTAF"); header.write("HEAD", 0x40); header.writeUInt32LE(0xb0, 0x44);
  header.writeUInt32LE(48000, 0x5c); header.writeUInt32LE(0x110, 0x60); header.write("DATA", 0x7f8);
  const stream = Buffer.concat([header, Buffer.alloc(Math.ceil(48000 / 256) * 0x110)]);
  const framing = Buffer.alloc(16); framing.writeUInt32LE(0x110001); framing.writeUInt32LE(stream.length + 16, 4);
  return Buffer.concat([framing, stream]);
}
const write = async (file: string, content: Buffer | string) => { await mkdir(join(file, ".."), { recursive: true }); await writeFile(file, content); };
let root: string; let steam: string; let data: string; let decoder: string; let source: string;
const run = vi.fn(async (_tool: string, args: string[]) => {
  const wav = Buffer.alloc(48); wav.write("RIFF"); wav.writeUInt32LE(40, 4); wav.write("WAVE", 8);
  await writeFile(args[args.indexOf("-o") + 1]!, wav);
  return { code: 0, stdout: "", stderr: "" };
});
const reader = () => createGameSoundtrackReader({ run, decoder: () => decoder, packs: loadPacks });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "game-music-")); steam = join(root, "Steam"); data = join(root, "profile"); decoder = join(root, "decoder.exe");
  await write(decoder, "decoder"); run.mockClear();
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
async function install() {
  const pack = loadPacks().find(item => item.id === "mg12")!;
  const install = join(steam, "steamapps/common/Custom MG Folder");
  await write(join(steam, `steamapps/appmanifest_${pack.steam.appId}.acf`), '"AppState" { "installdir" "Custom MG Folder" "buildid" "1" }');
  await write(join(install, pack.launch.exe), "game"); source = join(install, "us/bgm_2/mg2_bgm36_opening2.sdt");
  await write(source, fixture());
}
it("finds a custom install path, extracts once concurrently and preserves original and user audio", async () => {
  await install(); const original = await readFile(source); await write(join(data, "music/mg12/User.flac"), "user");
  const read = reader(); const lists = await Promise.all([read(data, steam), read(data, steam)]);
  expect(lists[0]).toHaveLength(1); expect(lists[0]![0]!.title).toBe("Zanzibar Breeze (Opening BGM 2)"); expect(run).toHaveBeenCalledTimes(1);
  const media = await resolveBonusFile(lists[0]![0]!.url); expect(media.file.startsWith(join(data, "native-music"))).toBe(true);
  expect(await readFile(source)).toEqual(original); expect(await readFile(join(data, "music/mg12/User.flac"), "utf8")).toBe("user");
  await read(data, steam); expect(run).toHaveBeenCalledTimes(1);
  await writeFile(media.file, "corrupt"); await read(data, steam); expect(run).toHaveBeenCalledTimes(2);
});
it("does not decode absent or malformed streams and can run with no games", async () => {
  expect(await reader()(data, null)).toEqual([]); expect(await reader()(data, steam)).toEqual([]);
  await install(); await writeFile(source, Buffer.alloc(50)); expect(await reader()(data, steam)).toEqual([]); expect(run).not.toHaveBeenCalled();
});
it("does not publish partial extraction after decoder failure", async () => {
  await install(); run.mockImplementationOnce(async () => ({ code: 1, stdout: "", stderr: "failed" }));
  expect(await reader()(data, steam)).toEqual([]); expect(await readdir(join(data, "native-music"))).toEqual([]);
  expect(await reader()(data, steam)).toHaveLength(1);
});
it("refuses a soundtrack link outside the detected installation", async () => {
  await install(); const external = join(root, "external"); await write(join(external, "mg2_bgm36_opening2.sdt"), fixture());
  await rm(source); await rmdir(join(source, "..")); await symlink(external, join(source, ".."), "junction");
  expect(await reader()(data, steam)).toEqual([]); expect(run).not.toHaveBeenCalled();
});

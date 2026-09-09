import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPacks } from "../shared/packs";
import { MENU_SOUNDS } from "../shared/menuSounds";
import { createNativeSoundReader } from "../electron/main/music/nativeSounds";

let root: string; let steam: string; let data: string; let tool: string;
const wav = (): Buffer => {
  const value = Buffer.alloc(48); value.write("RIFF"); value.writeUInt32LE(40, 4); value.write("WAVEfmt ", 8); value.writeUInt32LE(16, 16);
  value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22); value.writeUInt32LE(44100, 24); value.writeUInt32LE(88200, 28); value.writeUInt16LE(2, 32);
  value.writeUInt16LE(16, 34); value.write("data", 36); value.writeUInt32LE(4, 40); value.writeInt16LE(500, 44); return value;
};
const write = async (file: string, bytes: string | Buffer) => { await mkdir(join(file, ".."), { recursive: true }); await writeFile(file, bytes); };
async function install(id: string, library = steam) {
  const pack = loadPacks().find(pack => pack.id === id)!; const directory = join(library, "steamapps/common", `custom-${id}`);
  await write(join(library, `steamapps/appmanifest_${pack.steam.appId}.acf`), `"AppState" { "installdir" "custom-${id}" "buildid" "42" }`);
  await write(join(directory, pack.launch.exe), "game");
  if (id === "mgs1") { await write(join(directory, "windata/alldata.psb.m"), "index"); await write(join(directory, "windata/alldata.bin"), "archive"); }
  else {
    const asset = pack.assets.find(asset => asset.source === "unity" && asset.path.includes("/StreamingAssets/"));
    if (asset?.source !== "unity") throw new Error("fixture pack unavailable");
    await write(join(directory, `${asset.path.split("/StreamingAssets/")[0]}/StreamingAssets/aa/StandaloneWindows64/defaultlocalgroup_assets_launcher/se/sounddata_se.asset.bundle`), "sound bundle");
  }
}
const run = vi.fn(async (_exe: string, args: string[]) => {
  const output = args[args.indexOf("-o") + 1]!;
  if (args.at(-1)?.endsWith("alldata.psb.m")) await write(join(output, "alldata.psb.m.json"), JSON.stringify({ file_info: { "system/sound/se.psb": [0, 7] } }));
  else {
    const names = args.at(-1)?.endsWith("se.psb") ? ["se_move.wav.wav", "se_decide.wav.wav", "se_back.wav.wav", "se_open.wav.wav", "se_increment.wav.wav", "se_title_start.wav.wav"]
      : ["11通常カーソル.wav", "12通常決定.wav", "13通常キャンセル.wav", "sfx_title_select.wav"];
    for (const name of names) await write(join(output, "clips", name), wav());
  }
  return { code: 0, stdout: "", stderr: "" };
});
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "native-sounds-")); steam = join(root, "Steam"); data = join(root, "data"); tool = join(root, "decoder.exe");
  await write(tool, "decoder"); run.mockClear();
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const reader = () => createNativeSoundReader({ run, tools: () => ({ assetStudio: tool, psbDecompile: tool }) });

it("extracts MGS1 clips once, coalesces requests, preserves user sounds and repairs corrupt cache", async () => {
  await install("mgs1"); await write(join(data, "sounds/navigate.wav"), "custom sound");
  const read = reader(); const results = await Promise.all([read(steam, data), read(steam, data)]);
  expect(Object.keys(results[0]!)).toEqual(MENU_SOUNDS); expect(run).toHaveBeenCalledTimes(2);
  expect(await readFile(join(data, "sounds/navigate.wav"), "utf8")).toBe("custom sound");
  const [cache] = await readdir(join(data, "native-sounds"));
  await write(join(data, "native-sounds", cache!, "navigate.wav"), "corrupt");
  await read(steam, data); expect(run).toHaveBeenCalledTimes(4);
  const date = new Date("2030-01-01T00:00:00Z"); await utimes(tool, date, date);
  await read(steam, data); expect(run).toHaveBeenCalledTimes(4);
  await write(tool, "updated decoder"); await read(steam, data); expect(run).toHaveBeenCalledTimes(6);
});
it("discovers a nested Unity launcher in a different Steam library and supports partial installations", async () => {
  const library = join(root, "Games on another drive"); await install("mgspw", library);
  await write(join(steam, "steamapps/libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${library.replace(/\\/g, "\\\\")}" } }`);
  expect(Object.keys(await reader()(steam, data))).toHaveLength(7); expect(run).toHaveBeenCalledTimes(1);
});
it("falls back to installed Unity sounds after a damaged MGS1 source", async () => {
  await install("mgs1"); await install("mgs2");
  run.mockImplementationOnce(async () => ({ code: 1, stdout: "", stderr: "damaged source" }));
  expect(Object.keys(await reader()(steam, data))).toHaveLength(7); expect(run).toHaveBeenCalledTimes(2);
});
it("does not require a decoder without installed games, but reports failure if every installed source fails", async () => {
  expect(await reader()(null, data)).toEqual({}); expect(await reader()(steam, data)).toEqual({}); expect(run).not.toHaveBeenCalled();
  await install("mgs1"); run.mockImplementationOnce(async () => ({ code: 1, stdout: "", stderr: "broken" }));
  await expect(reader()(steam, data)).rejects.toThrow("Could not prepare native menu sounds");
});

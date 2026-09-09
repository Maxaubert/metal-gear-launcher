import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverBonus } from "../electron/main/bonus/discovery";
import { allowBonusFile, resolveBonusFile } from "../electron/main/bonus/media";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "hub-bonus-files-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("discovers partial bonus installs in an alternate Steam library and ignores missing volumes", async () => {
  const steam = join(root, "Steam");
  const other = join(root, "Other Library");
  await mkdir(join(steam, "steamapps"), { recursive: true });
  await mkdir(join(other, "steamapps/common/Custom Bonus/windata"), { recursive: true });
  await writeFile(join(steam, "steamapps/libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${other.replace(/\\/g, "\\\\")}" } }`);
  await writeFile(join(other, "steamapps/appmanifest_3036720.acf"), '"AppState" { "installdir" "Custom Bonus" "buildid" "1234" }');
  expect(await discoverBonus(steam)).toEqual([]);
  await writeFile(join(other, "steamapps/common/Custom Bonus/windata/alldata.bin"), "archive");
  expect(await discoverBonus(steam)).toEqual([{ id: "vol2", path: join(other, "steamapps/common/Custom Bonus"), build: "1234" }]);
  expect(await discoverBonus(null)).toEqual([]);
  await writeFile(join(other, "steamapps/appmanifest_3036720.acf"), '"AppState" { "installdir" "../Escape" "buildid" "1234" }');
  expect(await discoverBonus(steam)).toEqual([]);
});

it("serves only opaque registered files, rejecting traversal and later replacement", async () => {
  const file = join(root, "movie");
  await writeFile(file, "movie fixture");
  const url = await allowBonusFile(file, root, "video/mp4");
  expect(url).toMatch(/^hub-bonus:\/\/media\/[a-f0-9]{64}$/);
  expect(await resolveBonusFile(url)).toEqual({ file: await realpath(file), contentType: "video/mp4" });
  for (const candidate of [url + "?file=secret", url + "/../other", url.replace("/media/", "/media/%2e%2e/"), "file:///secret", "hub-bonus://media/" + "0".repeat(64)]) {
    await expect(resolveBonusFile(candidate)).rejects.toThrow();
  }
  await writeFile(file, "changed larger movie fixture");
  await expect(resolveBonusFile(url)).rejects.toThrow(/changed/);
});

it("rejects media symlinks escaping the installation", async () => {
  const install = join(root, "install");
  const outside = join(root, "outside");
  await mkdir(install); await mkdir(outside);
  await writeFile(join(outside, "secret"), "private");
  await symlink(outside, join(install, "redirect"), "junction");
  await expect(allowBonusFile(join(install, "redirect/secret"), install, "audio/mp4")).rejects.toThrow(/outside/);
});

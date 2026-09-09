import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temporary: string[] = [];
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
async function restore(source: string, destination: string) {
  return promisify(execFile)("pwsh", ["-NoProfile", "-NonInteractive", "-Command",
    `$ErrorActionPreference = 'Stop'; . ${quote(resolve("scripts/unpackaged-install.ps1"))}; Restore-MissingLauncherMedia -SourceRoot ${quote(source)} -DestinationRoot ${quote(destination)}`,
  ], { windowsHide: true });
}
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });

it("recovers missing staged songs and sounds without replacing physical files or restoring state", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-unpackaged-media-")); temporary.push(root);
  const source = join(root, "staged"), destination = join(root, "ordinary user");
  for (const folder of [source, destination]) await mkdir(join(folder, "music", "mgs3"), { recursive: true });
  await mkdir(join(source, "sounds"));
  await writeFile(join(source, "music", "mgs3", "Existing.flac"), "staged duplicate");
  await writeFile(join(destination, "music", "mgs3", "Existing.flac"), "physical original");
  await writeFile(join(source, "music", "mgs3", "Snake Eater.flac"), Buffer.from([0, 255, 42]));
  await writeFile(join(source, "sounds", "navigate.wav"), "custom sound");
  await writeFile(join(source, "config.json"), "old config");
  await restore(source, destination);
  expect(await readFile(join(destination, "music", "mgs3", "Existing.flac"), "utf8")).toBe("physical original");
  expect(await readFile(join(destination, "music", "mgs3", "Snake Eater.flac"))).toEqual(Buffer.from([0, 255, 42]));
  expect(await readFile(join(destination, "sounds", "navigate.wav"), "utf8")).toBe("custom sound");
  await expect(readFile(join(destination, "config.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(source, "music", "mgs3", "Existing.flac"), "utf8")).toBe("staged duplicate");
});

it("refuses a redirected destination before copying staged files", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-unpackaged-redirect-")); temporary.push(root);
  const source = join(root, "staged"), destination = join(root, "ordinary user"), outside = join(root, "outside");
  await mkdir(join(source, "music", "mgs3"), { recursive: true });
  await mkdir(destination); await mkdir(outside);
  await writeFile(join(source, "music", "mgs3", "Snake Eater.flac"), "song");
  await symlink(outside, join(destination, "music"), "junction");
  await expect(restore(source, destination)).rejects.toThrow();
  await expect(readFile(join(outside, "mgs3", "Snake Eater.flac"))).rejects.toMatchObject({ code: "ENOENT" });
});

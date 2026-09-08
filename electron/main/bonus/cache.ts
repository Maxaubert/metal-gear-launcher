import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { decodeManifest, decompileM2File, sliceArchiveFile, type FileEntry } from "../extract/m2";
import { toolPaths } from "../extract/tools";
import type { BonusInstall } from "./discovery";

export interface DecodedBonus { json: Record<string, unknown>; directory: string }
export class BonusCache {
  private table?: Promise<Map<string, FileEntry>>;
  constructor(readonly install: BonusInstall, readonly directory: string) {}

  static async open(install: BonusInstall, dataDir: string): Promise<BonusCache> {
    const identities = await Promise.all([join(install.path, "windata/alldata.psb.m"), join(install.path, "windata/alldata.bin"), toolPaths().psbDecompile]
      .map(async file => { const info = await stat(file); return `${file}:${info.size}:${info.mtimeMs}`; }));
    const key = createHash("sha256").update(JSON.stringify([2, install.build, identities])).digest("hex").slice(0, 24);
    const directory = join(dataDir, "bonus", install.id, key);
    await mkdir(directory, { recursive: true });
    return new BonusCache(install, directory);
  }

  async decode(file: string): Promise<DecodedBonus> {
    const key = createHash("sha256").update(file).digest("hex").slice(0, 24);
    const directory = join(this.directory, key);
    try {
      const json = JSON.parse(await readFile(join(directory, "decoded.json"), "utf8"));
      const resources: { file: string; size: number; modified: number }[] = JSON.parse(await readFile(join(directory, "resources.json"), "utf8"));
      for (const resource of resources) {
        const info = await stat(join(directory, resource.file));
        if (!info.isFile() || info.size !== resource.size || info.mtimeMs !== resource.modified) throw new Error("Cached bonus resource changed");
      }
      return { json, directory };
    } catch { /* A failed extraction never becomes a valid cache entry. */ }
    this.table ??= decodeManifest(this.install.path, "windata/alldata");
    const entry = (await this.table).get(file);
    if (!entry || entry.size > 128 * 1024 * 1024) throw new Error(`Unavailable bonus asset: ${basename(file)}`);
    const temporary = await mkdtemp(join(this.directory, "extract-"));
    try {
      const local = join(temporary, basename(file));
      await sliceArchiveFile(join(this.install.path, "windata/alldata.bin"), entry, local);
      await decompileM2File(local, temporary);
      // FreeMote sometimes exits successfully after reporting a decode failure.
      const json = JSON.parse(await readFile(`${local}.json`, "utf8"));
      await writeFile(join(temporary, "decoded.json"), JSON.stringify(json));
      const resources: { file: string; size: number; modified: number }[] = [];
      for (const folder of await readdir(temporary, { withFileTypes: true })) {
        if (!folder.isDirectory()) continue;
        for (const name of await readdir(join(temporary, folder.name))) {
          const file = join(folder.name, name);
          const info = await stat(join(temporary, file));
          if (info.isFile()) resources.push({ file, size: info.size, modified: info.mtimeMs });
        }
      }
      await writeFile(join(temporary, "resources.json"), JSON.stringify(resources));
      await rm(directory, { recursive: true, force: true });
      await rename(temporary, directory);
      return { json, directory };
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
}

export async function bonusResource(decoded: DecodedBonus, name?: string): Promise<string> {
  for (const entry of await readdir(decoded.directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = join(decoded.directory, entry.name);
    const files = await readdir(folder);
    const match = name ? files.find(file => file === name) : files.find(file => file.endsWith(".png"));
    if (match) return join(folder, match);
  }
  throw new Error("Bonus artwork could not be decoded");
}

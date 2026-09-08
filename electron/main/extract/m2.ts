import { copyFile, mkdtemp, mkdir, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import sharp from "sharp";
import type { M2Asset } from "@shared/packs";
import { psbFileArgs, runTool, toolPaths } from "./tools";
import { ExtractError } from "./unity";
import { nativeTypographyMetrics } from "./nativeTypography";

export type FileEntry = { offset: number; size: number };

export function parseM2FileTable(manifest: unknown): Map<string, FileEntry> {
  const info = (manifest as { file_info?: Record<string, [number, number]> }).file_info ?? {};
  const table = new Map<string, FileEntry>();
  for (const [path, [offset, size]] of Object.entries(info)) table.set(path.replace(/\\/g, "/"), { offset, size });
  return table;
}

export function spriteRect(atlas: unknown, texture: string, id: string): { left: number; top: number; width: number; height: number } {
  const icon = (atlas as { source: Record<string, { icon: Record<string, { left: number; top: number; width: number; height: number }> }> }).source[texture]?.icon[id];
  if (!icon) throw new ExtractError(`sprite ${texture}/${id} not in atlas`);
  return { left: Math.round(icon.left), top: Math.round(icon.top), width: Math.round(icon.width), height: Math.round(icon.height) };
}

type Deps = { run: typeof runTool; tools: typeof toolPaths };
const defaults: Deps = { run: runTool, tools: toolPaths };

export async function decodeManifest(installDir: string, archive: string, deps: Deps = defaults): Promise<Map<string, FileEntry>> {
  const work = await mkdtemp(join(tmpdir(), "hub-m2-"));
  try {
    const copy = join(work, "alldata.psb.m");         // the file name feeds the MDF seed, keep it
    await copyFile(join(installDir, `${archive}.psb.m`), copy);
    const r = await deps.run(deps.tools().psbDecompile, psbFileArgs(copy, work));
    if (r.code !== 0) throw new ExtractError(`PsbDecompile failed on manifest: ${r.stderr || r.stdout}`, r);
    return parseM2FileTable(JSON.parse(await readFile(join(work, "alldata.psb.m.json"), "utf8")));
  } finally { await rm(work, { recursive: true, force: true }); }
}

export async function sliceArchiveFile(bodyPath: string, entry: FileEntry, destPath: string): Promise<void> {
  const fh = await open(bodyPath, "r");
  try {
    const buf = Buffer.alloc(entry.size);
    const { bytesRead } = await fh.read(buf, 0, entry.size, entry.offset);
    if (bytesRead !== entry.size) throw new ExtractError(`short read ${bytesRead}/${entry.size} at ${entry.offset}`);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, buf);
  } finally { await fh.close(); }
}

export async function decompileM2File(file: string, outDir: string, deps: Deps = defaults): Promise<void> {
  const r = await deps.run(deps.tools().psbDecompile, psbFileArgs(file, outDir));
  if (r.code !== 0) throw new ExtractError(`PsbDecompile failed on ${basename(file)}: ${r.stderr || r.stdout}`, r);
}

export async function cropSprite(atlasPng: string, atlasJson: unknown, texture: string, id: string, dest: string): Promise<void> {
  const rect = spriteRect(atlasJson, texture, id);
  await mkdir(dirname(dest), { recursive: true });
  await sharp(atlasPng).extract(rect).png().toFile(dest);
}

export async function extractM2Asset(installDir: string, asset: M2Asset, destFile: string, deps: Deps = defaults,
  table?: Map<string, FileEntry>): Promise<void> {
  const files = table ?? (await decodeManifest(installDir, asset.archive, deps));
  const entry = files.get(asset.file);
  if (!entry) throw new ExtractError(`${asset.file} not in ${asset.archive}`);
  const work = await mkdtemp(join(tmpdir(), "hub-m2-"));
  try {
    const fileBase = basename(asset.file);
    const local = join(work, fileBase);
    await sliceArchiveFile(join(installDir, `${asset.archive}.bin`), entry, local);
    await decompileM2File(local, work, deps);
    if (asset.format === "metrics") {
      const atlasJson = JSON.parse(await readFile(join(work, `${fileBase}.json`), "utf8"));
      await mkdir(dirname(destFile), { recursive: true });
      await writeFile(destFile, JSON.stringify(nativeTypographyMetrics(atlasJson)));
      return;
    }
    const resourceDir = await findResourceDir(work, fileBase);
    if (asset.sprite) {
      const atlasJson = JSON.parse(await readFile(join(work, `${fileBase}.json`), "utf8"));
      await cropSprite(join(resourceDir, `${asset.texture}-texture.png`), atlasJson, asset.texture, asset.sprite, destFile);
    } else if (asset.role === "bgm") {
      await copyFirst(resourceDir, [".wav", ".ogg", ".mp3"], destFile);
    } else if (asset.role.startsWith("font")) {
      await copyFirst(resourceDir, [".ttf", ".otf"], destFile);
    } else {
      await copyFirst(resourceDir, [".png"], destFile);
    }
  } finally { await rm(work, { recursive: true, force: true }); }
}

// PsbDecompile's output-folder naming differs from a simple "<name>.psb" convention: an MDF-shelled
// ".m" file's resources land in "<fullBasename>-resources" (an intermediate raw dump with the
// stripped name already occupies "<fullBasename minus .m>"), while a plain (unshelled) file like
// bgm's ".psb" lands directly in "<fullBasename minus its extension>" with no suffix. Rather than
// hard-code one pattern, look for whichever the tool actually produced.
async function findResourceDir(work: string, fileBase: string): Promise<string> {
  const stem = fileBase.replace(/\.psb(\.m)?$/, "");
  const candidates = [`${fileBase}-resources`, stem, `${stem}.psb`, `${stem}.psb-resources`, fileBase];
  const entries = await readdir(work, { withFileTypes: true });
  for (const candidate of candidates) {
    if (entries.some((e) => e.isDirectory() && e.name === candidate)) return join(work, candidate);
  }
  throw new ExtractError(`no resource folder produced for ${fileBase} in ${work}`);
}

async function copyFirst(dir: string, exts: string[], dest: string): Promise<void> {
  const names = await readdir(dir);
  const hit = names.find((n) => exts.includes(n.slice(n.lastIndexOf(".")).toLowerCase()));
  if (!hit) throw new ExtractError(`no ${exts.join("/")} produced in ${dir}`);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(dir, hit), dest);
}

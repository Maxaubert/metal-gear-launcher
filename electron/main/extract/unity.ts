import { mkdtemp, readdir, rename, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import type { UnityAsset } from "@shared/packs";
import { assetStudioArgs, runTool, toolPaths } from "./tools";

export class ExtractError extends Error { constructor(msg: string, public detail: { stderr?: string; stdout?: string } = {}) { super(msg); } }

// "Sprite" is for a texture packed into a sprite atlas (e.g. mgs2menutext.spriteatlas.bundle) -
// AssetStudioModCLI only resolves it by name with `-t sprite`; `-t tex2d` there only reaches the
// atlas's own combined texture (named after the atlas, not the individual asset).
const TYPE_FLAG = { Texture2D: "tex2d", Font: "font", AudioClip: "audio", Sprite: "sprite" } as const;
// AssetStudioModCLI exports MGS3's launcher fonts (MG-RodinProN-M/B) as .otf, not .ttf as the
// task brief assumed - verified against the real install. The caller still names destFile
// however it likes; this only controls what extension we look for in the tool's output.
const EXT = { Texture2D: ".png", Font: ".otf", AudioClip: ".wav", Sprite: ".png" } as const;

export async function extractUnityAsset(installDir: string, asset: UnityAsset, destFile: string,
  deps: { run: typeof runTool; tools: typeof toolPaths } = { run: runTool, tools: toolPaths }): Promise<void> {
  const work = await mkdtemp(join(tmpdir(), "hub-unity-"));
  try {
    const input = join(installDir, asset.path);
    const r = await deps.run(deps.tools().assetStudio, assetStudioArgs(input, work, [asset.name], [TYPE_FLAG[asset.type]]));
    if (r.code !== 0) throw new ExtractError(`AssetStudioModCLI failed (${r.code}) for ${asset.name}: ${r.stderr || r.stdout}`, r);
    const found = await findFile(work, asset.name, EXT[asset.type]);
    if (!found) throw new ExtractError(`AssetStudioModCLI produced no ${EXT[asset.type]} named ${asset.name}`, r);
    await mkdir(dirname(destFile), { recursive: true });
    await rename(found, destFile).catch(async () => { const { copyFile } = await import("node:fs/promises"); await copyFile(found, destFile); });
  } finally { await rm(work, { recursive: true, force: true }); }
}

async function findFile(dir: string, name: string, ext: string): Promise<string | null> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const r = await findFile(p, name, ext); if (r) return r; }
    else if (extname(e.name).toLowerCase() === ext && e.name.toLowerCase().startsWith(name.toLowerCase())) return p;
  }
  return null;
}

import { app } from "electron";
import { execFile } from "node:child_process";
import { basename, join } from "node:path";

export const M2_SEED = "25G/xpvTbsb+6";
export const M2_SEED_LENGTH = 64;

export function toolPaths(): { assetStudio: string; psbDecompile: string } {
  const base = app?.isPackaged ? join(process.resourcesPath, "tools") : join(process.cwd(), "resources", "tools");
  return { assetStudio: join(base, "AssetStudioModCLI", "AssetStudioModCLI.exe"), psbDecompile: join(base, "FreeMote", "PsbDecompile.exe") };
}

export function assetStudioArgs(input: string, outDir: string, names: string[], types: string[]): string[] {
  // --filter-with-regex is a presence flag (no value) in AssetStudioModCLI; omitting it
  // keeps the default literal (non-regex) name match, which is what we want here.
  return [input, "-o", outDir, "-t", types.join(","), "--filter-by-name", names.join(","), "-g", "none", "--image-format", "png", "--audio-format", "wav"];
}
export function psbInfoArgs(manifest: string, body: string, outDir: string): string[] {
  return ["info-psb", "-k", M2_SEED, "-l", String(M2_SEED_LENGTH), "-b", body, "-o", outDir, "-raw", manifest];
}
export function psbFileArgs(file: string, outDir: string): string[] {
  // FreeMote's MDF seed is Key+FileName concatenated into one string, not the key alone -
  // verified against the real MGS1 archive (the key alone fails to decrypt any .psb.m file).
  return ["-s", M2_SEED + basename(file), "-l", String(M2_SEED_LENGTH), "-o", outDir, file];
}

export function runTool(exe: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(exe, args, { cwd: opts.cwd, timeout: opts.timeoutMs ?? 600_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const code = err && "code" in err && typeof err.code === "number" ? err.code : err ? 1 : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) + (err && !("code" in err) ? String(err) : "") });
    });
  });
}

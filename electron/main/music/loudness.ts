import { app } from "electron";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LoudnessWavReader, type MusicLoudness } from "./loudnessDsp";

export type { MusicLoudness } from "./loudnessDsp";
const ANALYZER_VERSION = 1;
const MAX_INPUT_BYTES = 1024 ** 3;

function decoderPath() {
  return join(app?.isPackaged ? process.resourcesPath : join(process.cwd(), "resources"), "tools/vgmstream/vgmstream-cli.exe");
}

export function decodeMusicLoudness(decoder: string, file: string): Promise<MusicLoudness | undefined> {
  return new Promise(resolve => {
    const reader = new LoudnessWavReader();
    const child = spawn(decoder, ["-i", "-p", "-W", "4", file], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let failed = false;
    const timeout = setTimeout(() => { failed = true; child.kill(); }, 60000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (failed) return;
      try { reader.push(chunk); } catch { failed = true; child.kill(); }
    });
    child.on("error", () => { failed = true; });
    child.on("close", code => {
      clearTimeout(timeout);
      try { resolve(!failed && code === 0 ? reader.finish() : undefined); } catch { resolve(undefined); }
    });
  });
}

type Dependencies = {
  decoder: () => string;
  decode: (decoder: string, file: string) => Promise<MusicLoudness | undefined>;
};
const valid = (value: unknown): value is MusicLoudness => {
  const result = value as MusicLoudness | null;
  return !!result && Number.isFinite(result.lufs) && result.lufs >= -70 && result.lufs <= 30 &&
    Number.isFinite(result.peak) && result.peak > 0 && result.peak <= 16;
};

/** Analysis never modifies source audio. Only small measurement records are cached. */
export function createMusicLoudnessAnalyzer(deps: Dependencies = { decoder: decoderPath, decode: decodeMusicLoudness }) {
  const pending = new Map<string, Promise<MusicLoudness | undefined>>();
  const queue: Array<() => void> = [];
  let active = 0;
  async function limited<T>(work: () => Promise<T>): Promise<T> {
    if (active >= 2) await new Promise<void>(resolve => queue.push(resolve));
    else active++;
    try { return await work(); } finally {
      const next = queue.shift();
      if (next) next(); else active--;
    }
  }

  return async (dataDir: string, file: string): Promise<MusicLoudness | undefined> => {
    try {
      const source = await realpath(file);
      const info = await stat(source);
      if (!info.isFile() || info.size < 44 || info.size > MAX_INPUT_BYTES) return undefined;
      const decoder = deps.decoder();
      const decoderInfo = await stat(decoder);
      const identity = JSON.stringify([ANALYZER_VERSION, source, info.size, info.mtimeMs, decoderInfo.size, decoderInfo.mtimeMs]);
      const key = createHash("sha256").update(identity).digest("hex");
      const folder = join(dataDir, "music-loudness");
      const cache = join(folder, `${key}.json`);
      const existing = pending.get(cache);
      if (existing) return existing;
      const work = (async () => {
        try {
          if ((await stat(cache)).size < 1024) {
            const stored: unknown = JSON.parse(await readFile(cache, "utf8"));
            if (valid(stored)) return stored;
          }
        } catch { /* Missing or damaged measurements are recomputed. */ }
        return limited(async () => {
          const result = await deps.decode(decoder, source);
          if (!valid(result)) return undefined;
          const after = await stat(source);
          if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) return undefined;
          await mkdir(folder, { recursive: true });
          const temporary = join(folder, `${key}.${randomUUID()}.tmp`);
          try {
            await writeFile(temporary, JSON.stringify(result), { flag: "wx" });
            await rename(temporary, cache);
          } finally { await rm(temporary, { force: true }); }
          return result;
        });
      })().catch(() => undefined);
      pending.set(cache, work);
      try { return await work; } finally { pending.delete(cache); }
    } catch { return undefined; }
  };
}

export const analyzeMusicLoudness = createMusicLoudnessAnalyzer();

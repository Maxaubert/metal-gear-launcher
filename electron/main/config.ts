import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { menuMusicSelections } from "../../shared/menuMusic";
import { configFile as defaultConfigFile } from "./paths";

export const configSchema = z.object({
  steamPath: z.string().min(1).optional(),
  volume: z.number().min(0).max(1).default(0.6),
  lastGame: z.string().min(1).optional(),
  menuMusic: menuMusicSelections.optional(),
});
export type Config = z.infer<typeof configSchema>;

export async function readConfig(file: string = defaultConfigFile()): Promise<Config> {
  try {
    return configSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch {
    // Missing file (first run), unreadable JSON, or a schema mismatch all fall back to defaults
    // rather than crashing the hub on a corrupt config.
    return configSchema.parse({});
  }
}

const writes = new Map<string, Promise<unknown>>();

export async function writeConfig(patch: Partial<Config>, file: string = defaultConfigFile()): Promise<Config> {
  const key = resolve(file);
  const validated = configSchema.partial().strict().parse(patch);
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const previous = await readConfig(file);
    const next = configSchema.parse({ ...previous, ...validated,
      ...(validated.menuMusic ? { menuMusic: { ...previous.menuMusic, ...validated.menuMusic } } : {}),
    });
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2));
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
    return next;
  });
  writes.set(key, pending);
  try { return await pending; }
  finally { if (writes.get(key) === pending) writes.delete(key); }
}

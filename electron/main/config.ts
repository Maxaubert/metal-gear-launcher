import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { configFile as defaultConfigFile } from "./paths";

export const configSchema = z.object({
  steamPath: z.string().min(1).optional(),
  volume: z.number().min(0).max(1).default(0.6),
  lastGame: z.string().min(1).optional(),
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

export async function writeConfig(patch: Partial<Config>, file: string = defaultConfigFile()): Promise<Config> {
  const next = configSchema.parse({ ...(await readConfig(file)), ...patch });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2));
  return next;
}

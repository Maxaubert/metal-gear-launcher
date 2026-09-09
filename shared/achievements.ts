import { z } from "zod";
import { settingsGameId } from "./settings";

export const achievementSchema = z.object({
  id: z.string().min(1).max(512), name: z.string().max(2000), description: z.string().max(10000),
  iconUrl: z.string().max(2048).optional(), unlocked: z.boolean().nullable(),
  unlockedAt: z.number().nonnegative().optional(), percent: z.number().min(0).max(100).nullable(),
  hidden: z.boolean().default(false),
});
export type Achievement = z.infer<typeof achievementSchema>;
export const achievementSourceSchema = z.object({
  id: z.string().max(256), platform: z.enum(["steam", "gog"]), label: z.string().max(512),
  status: z.enum(["ready", "unavailable"]), personalStatus: z.enum(["available", "unavailable"]),
  message: z.string().max(2000).optional(), updatedAt: z.number().nonnegative(), stale: z.boolean(),
  achievements: z.array(achievementSchema).max(5000),
});
export type AchievementSource = z.infer<typeof achievementSourceSchema>;
export const achievementsRequest = z.object({ gameId: settingsGameId, refresh: z.boolean().optional() }).strict();
export type AchievementsRequest = z.infer<typeof achievementsRequest>;
export const achievementsSnapshotSchema = z.object({ gameId: settingsGameId, sources: z.array(achievementSourceSchema).max(30) });
export type AchievementsSnapshot = z.infer<typeof achievementsSnapshotSchema>;

/** Images may only come from the platforms that supplied the trophy data. */
export function achievementIconUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    if (!["steamstatic.com", "steamcommunity.com", "gog.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return undefined;
    return url.href;
  } catch { return undefined; }
}

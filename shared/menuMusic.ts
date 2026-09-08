import { z } from "zod";
import { settingsGameId } from "./settings";

export type MusicGameId = z.infer<typeof settingsGameId>;
export type MenuTheme = { id: string; label: string; assetRole: "bgm" };

/** Stable catalog IDs are persisted, never filesystem paths or renderer URLs. */
const original = (id: MusicGameId): readonly MenuTheme[] => [{ id: `${id}-original`, label: "Original Menu Theme", assetRole: "bgm" }];
export const MENU_THEMES: Record<MusicGameId, readonly MenuTheme[]> = {
  mg12: original("mg12"), mgs1: original("mgs1"), mgs2: original("mgs2"),
  mgs3: original("mgs3"), mgs4: original("mgs4"), mgspw: original("mgspw"),
};

export const menuMusicRequest = z.object({ gameId: settingsGameId, themeId: z.string().max(100) }).strict()
  .refine(({ gameId, themeId }) => MENU_THEMES[gameId].some(theme => theme.id === themeId), "Unknown menu theme for this game.");
export type MenuMusicRequest = z.infer<typeof menuMusicRequest>;
export const menuMusicSelections = z.record(settingsGameId, z.string().max(100)).refine(
  selections => Object.entries(selections).every(([gameId, themeId]) => MENU_THEMES[gameId as MusicGameId].some(theme => theme.id === themeId)),
  "Unknown menu theme for this game.",
);
export type MenuMusicSelections = z.infer<typeof menuMusicSelections>;

export function resolveMenuMusic(gameId: MusicGameId, assets: { bgm?: string }, selected?: string): string | undefined {
  const catalog = MENU_THEMES[gameId];
  const theme = catalog.find(item => item.id === selected) ?? catalog[0];
  return theme ? assets[theme.assetRole] : undefined;
}

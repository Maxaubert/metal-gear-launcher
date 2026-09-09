import { z } from "zod";
import { settingsGameId } from "./settings";

export type MusicGameId = z.infer<typeof settingsGameId>;
export type MenuTheme = { id: string; label: string; assetRole?: "bgm"; url?: string };
export type MenuMusicLibrary = { gameId: MusicGameId; themes: MenuTheme[]; defaultThemeId: string; folderPath: string };
export const MUSIC_PROTOCOL = "hub-music";
export const DEFAULT_MENU_MUSIC_FILENAMES: Partial<Record<MusicGameId, string>> = {
  mg12: "Zanzibar Breeze (Opening BGM 2).flac",
  mgs1: "Introduction.flac",
  mgs2: "Metal Gear Solid Main Theme.flac",
  mgs3: "Snake Eater.flac",
  mgs4: "Old Snake (Title).flac",
  mgspw: "Heavens Divide.flac",
};

/** Stable file IDs are persisted, never filesystem paths or renderer URLs. */
export function isMenuThemeId(gameId: MusicGameId, themeId: string): boolean {
  return new RegExp(`^${gameId}-file-[a-f0-9]{64}$`).test(themeId);
}
export const menuMusicRequest = z.object({ gameId: settingsGameId, themeId: z.string().max(100) }).strict()
  .refine(({ gameId, themeId }) => isMenuThemeId(gameId, themeId), "Unknown menu theme for this game.");
export type MenuMusicRequest = z.infer<typeof menuMusicRequest>;
export const menuMusicSelections = z.record(settingsGameId, z.string().max(100)).refine(
  // Read legacy selections without discarding the rest of an existing configuration.
  selections => Object.entries(selections).every(([gameId, themeId]) => themeId === `${gameId}-original` || isMenuThemeId(gameId as MusicGameId, themeId)),
  "Unknown menu theme for this game.",
);
export type MenuMusicSelections = z.infer<typeof menuMusicSelections>;

export function availableMenuThemes(gameId: MusicGameId, _assets: { bgm?: string }, library?: MenuMusicLibrary): readonly MenuTheme[] {
  const catalog = library?.gameId === gameId ? library.themes : [];
  return catalog.filter(theme => isMenuThemeId(gameId, theme.id) && theme.url);
}

export function effectiveMenuTheme(gameId: MusicGameId, assets: { bgm?: string }, selected?: string, library?: MenuMusicLibrary): MenuTheme | undefined {
  const catalog = availableMenuThemes(gameId, assets, library);
  return catalog.find(item => item.id === selected) ?? catalog.find(item => item.id === library?.defaultThemeId) ?? catalog[0];
}

export function resolveMenuMusic(gameId: MusicGameId, assets: { bgm?: string }, selected?: string, library?: MenuMusicLibrary): string | undefined {
  const theme = effectiveMenuTheme(gameId, assets, selected, library);
  return theme?.url;
}

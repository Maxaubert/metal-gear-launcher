import { z } from "zod";

export const assetRole = z.enum(["mainVisual", "logo", "numbering", "year", "bgEffect", "bgm", "fontMedium", "fontBold"]);
export type AssetRole = z.infer<typeof assetRole>;

const unityAsset = z.object({
  role: assetRole, source: z.literal("unity"),
  path: z.string().min(1),              // relative to the install dir
  name: z.string().min(1),              // asset name inside the bundle or .assets file
  type: z.enum(["Texture2D", "Font", "AudioClip"]).default("Texture2D"),
});
const m2Asset = z.object({
  role: assetRole, source: z.literal("m2"),
  archive: z.string().default("windata/alldata"),   // alldata.bin + alldata.psb.m, relative to install dir
  file: z.string().min(1),              // path inside the archive, e.g. system/motion/outgame_menu_main.psb.m
  sprite: z.string().optional(),        // icon id inside the decoded atlas, e.g. "0019"
  texture: z.string().default("tex#000"),
});
export const assetEntry = z.discriminatedUnion("source", [unityAsset, m2Asset]);
export type AssetEntry = z.infer<typeof assetEntry>;
export type UnityAsset = z.infer<typeof unityAsset>;
export type M2Asset = z.infer<typeof m2Asset>;

export const packSchema = z.object({
  id: z.enum(["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]),
  title: z.string(), shortTitle: z.string(), number: z.string(),
  yearLabel: z.string(), subtitle: z.string(), description: z.string(),
  theme: z.object({ accent: z.string().regex(/^#[0-9a-f]{6}$/i), ink: z.string(), paper: z.string() }),
  steam: z.object({ appId: z.number().int(), installDir: z.string() }),
  launch: z.object({ exe: z.string(), cwd: z.string().default("."), env: z.record(z.string()).default({}), steamOnly: z.boolean().default(false) }),
  assets: z.array(assetEntry).min(1),
  menu: z.array(z.enum(["start", "gameSelection", "quit"])).default(["start", "gameSelection", "quit"]),
});
export type Pack = z.infer<typeof packSchema>;

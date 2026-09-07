import { z } from "zod";

// `mainVisual2` exists only for a `chapters` pack (spec 4.7's MG1&2 delta): the second stacked
// key-art panel, paired with `chapters[1]` the way `mainVisual` pairs with `chapters[0]`.
// `logo2` exists only for a `chapters` pack: the second panel's own logo lockup, paired with
// `chapters[1]` the way `logo` pairs with `chapters[0]`.
export const assetRole = z.enum(["mainVisual", "mainVisual2", "logo", "logo2", "numbering", "year", "bgEffect", "bgm", "fontMedium", "fontBold", "headerYear", "headerSubtitle", "headerYear2", "headerSubtitle2", "fontUi", "headerMark", "backgroundArt", "reticle1", "reticle2", "reticle3", "settingsHeader", "settingsTimeline", "settingsOverlay", "wallpaper1", "wallpaper2", "wallpaper3", "wallpaper4", "wallpaper5", "wallpaper6", "wallpaperDisplayArea", "settingsGrid", "settingsGridFine", "settingsGridBase", "settingsPattern2", "settingsPattern3", "settingsPattern4", "settingsPattern5", "settingsPattern6"]);
export type AssetRole = z.infer<typeof assetRole>;

// Whether the texture is already cut to its subject ("cut", the default) or needs the soft
// mask GameScreen applies for rectangular launcher backgrounds ("fade") - spec 4.7.
const assetEdge = z.enum(["fade", "cut"]).default("cut");

const unityAsset = z.object({
  role: assetRole, source: z.literal("unity"),
  path: z.string().min(1),              // relative to the install dir
  name: z.string().min(1),              // asset name inside the bundle or .assets file
  // "Sprite" covers a texture packed into a sprite atlas bundle (e.g. the real timeline ghost
  // for MG1&2/MGS2, which AssetStudioModCLI can only resolve with -t sprite, not -t tex2d,
  // since the underlying Texture2D is the whole atlas, not the individual asset).
  type: z.enum(["Texture2D", "Font", "AudioClip", "Sprite"]).default("Texture2D"),
  edge: assetEdge,
});
const m2Asset = z.object({
  role: assetRole, source: z.literal("m2"),
  archive: z.string().default("windata/alldata"),   // alldata.bin + alldata.psb.m, relative to install dir
  file: z.string().min(1),              // path inside the archive, e.g. system/motion/outgame_menu_main.psb.m
  sprite: z.string().optional(),        // icon id inside the decoded atlas, e.g. "0019"
  texture: z.string().default("tex#000"),
  edge: assetEdge,
});
export const assetEntry = z.discriminatedUnion("source", [unityAsset, m2Asset]);
export type AssetEntry = z.infer<typeof assetEntry>;
export type UnityAsset = z.infer<typeof unityAsset>;
export type M2Asset = z.infer<typeof m2Asset>;

// Per-pack override of the main visual's box (spec 4.7's "art floats into the background,
// cropped by the bottom edge" feel) - see GameScreen.tsx. Omitted entirely for packs that
// should keep the shared `.main-visual` CSS defaults (bottom-anchored, 94vh/11vw/50vw).
export const visualFitSchema = z.object({
  heightVh: z.number().default(100),
  leftVw: z.number().default(11),
  widthVw: z.number().default(50),
  anchor: z.enum(["top", "bottom"]).default("bottom"),
});
export type VisualFit = z.infer<typeof visualFitSchema>;

// Per-pack override of the bgEffect layer's box (spec 4.7's "behind the main visual and logo
// strip" ghost wash) - see ScreenBackdrop.tsx. Omitted entirely for packs that should keep the
// shared `.ghost-effect` CSS defaults (2vw/2vh origin, 58vw wide, 18% opacity). MGS3's reference
// needs a wider, fainter version that bleeds across the header too (spec 4.7 delta note), which
// the shared default can't express without affecting every other pack's already-correct layer.
export const bgEffectFitSchema = z.object({
  leftVw: z.number().default(2),
  topVh: z.number().default(2),
  widthVw: z.number().default(58),
  opacity: z.number().default(0.18),
});
export type BgEffectFit = z.infer<typeof bgEffectFitSchema>;

// A pack's optional two-chapter variant (spec 4.7's MG1&2 delta): MG1&2 is structurally
// different from every other screen - two stacked key-art panels on the left (`mainVisual` and
// `mainVisual2`), and two year blocks with their own description in the right column, above the
// menu, instead of the single header+description every other pack renders. Expressed as data so
// `ScreenBackdrop`/`GameScreen` branch on "does this pack have chapters", never on `pack.id`.
export const chapterSchema = z.object({
  yearLabel: z.string(),
  title: z.string(),
  description: z.string(),
  // The rotated text lockup over this chapter's own key-art panel (spec 4.7: "Games without a
  // vertical logo texture render the title as rotated Rodin bold text") - e.g. "METAL GEAR" for
  // the 1995 panel, distinct from `title` (the incident name shown under the year).
  gameTitle: z.string(),
});
export type Chapter = z.infer<typeof chapterSchema>;

export const packSchema = z.object({
  id: z.enum(["mg12", "mgs1", "mgs2", "mgs3", "mgs4", "mgspw"]),
  title: z.string(), shortTitle: z.string(), number: z.string(),
  releaseYear: z.number().int().min(1987),
  // The header's `[ 00N ]` mark (spec 4.7) - a fixed per-pack label, not the pack's computed
  // position in PACK_ORDER, since the original UI's numbering doesn't always match release order.
  indexLabel: z.string().min(1),
  yearLabel: z.string(), subtitle: z.string(), description: z.string(),
  // `paperLeft` is an optional per-pack override that tints the left zone only (spec 4.7's MGS3
  // delta: "a soft tint down the left" while the right column stays paper-white) - defaults to
  // `paper` (no visible seam) when a pack doesn't set it.
  theme: z.object({ accent: z.string().regex(/^#[0-9a-f]{6}$/i), ink: z.string(), paper: z.string(), paperLeft: z.string().regex(/^#[0-9a-f]{6}$/i).optional() }),
  steam: z.object({ appId: z.number().int(), installDir: z.string() }),
  launch: z.object({ exe: z.string(), cwd: z.string().default("."), env: z.record(z.string()).default({}), steamOnly: z.boolean().default(false) }),
  assets: z.array(assetEntry).min(1),
  assetRevision: z.number().int().nonnegative().default(0),
  menu: z.array(z.enum(["start", "gameSelection", "options", "quit"])).default(["start", "gameSelection", "options", "quit"]),
  visualFit: visualFitSchema.optional(),
  bgEffectFit: bgEffectFitSchema.optional(),
  chapters: z.array(chapterSchema).length(2).optional(),
});
export type Pack = z.infer<typeof packSchema>;

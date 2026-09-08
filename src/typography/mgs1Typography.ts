import type { GameState } from "@shared/ipc";
import type { NativeFontMetrics, NativeTextMetrics } from "@shared/nativeTypography";

type Typography = { text?: NativeTextMetrics; font?: NativeFontMetrics };
const loaded = new Map<string, Typography>();
const pending = new Map<string, Promise<void>>();
const keyFor = (urls: GameState["assetUrls"]) => `${urls.nativeTextMetrics ?? ""}\n${urls.nativeFontMetrics ?? ""}`;

export function mgs1Typography(urls: GameState["assetUrls"]): Typography | undefined { return loaded.get(keyFor(urls)); }

/** Called by the presentation gate, so text never switches fonts after the scene appears. */
export function preloadMgs1Typography(urls: GameState["assetUrls"]): Promise<void> {
  const key = keyFor(urls);
  if (loaded.has(key)) return Promise.resolve();
  if (!pending.has(key)) pending.set(key, (async () => {
    const data: Typography = {};
    const controller = new AbortController();
    const images: HTMLImageElement[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        for (const image of images) image.src = "";
        reject(new Error("Native typography loading timed out. Please retry."));
      }, 12000);
    });
    try { await Promise.race([deadline, Promise.all([
      urls.nativeTextMetrics && fetch(urls.nativeTextMetrics, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("Unable to load native text geometry");
        const text = await response.json() as NativeTextMetrics;
        if (text.kind !== "sprites" || !text.sprites) throw new Error("Invalid native text geometry");
        data.text = text;
      }),
      urls.nativeFontMetrics && fetch(urls.nativeFontMetrics, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("Unable to load native font geometry");
        const font = await response.json() as NativeFontMetrics;
        if (font.kind !== "font" || !font.glyphs || !(font.size > 0)) throw new Error("Invalid native font geometry");
        data.font = font;
      }),
      ...[urls.nativeTextAtlas, urls.nativeFontAtlas].filter((url): url is string => Boolean(url)).map(async url => {
        const image = new Image(); images.push(image); image.src = url; await image.decode();
      }),
    ])]); } catch (error) {
      controller.abort();
      for (const image of images) image.src = "";
      throw error;
    } finally { clearTimeout(timer); }
    loaded.set(key, data);
  })().catch(error => { pending.delete(key); throw error; }));
  return pending.get(key)!;
}

// IDs follow the native English motion labels. No font outlines or image data are embedded.
export const MGS1_TEXT_SPRITES = {
  story: "0010", yearAndSubtitle: "0025", start: "0083", gameSelection: "0282", options: "0286", quit: "0288",
  language: "0234", screen: "0242", audio: "0246", notices: "0243", buttonSettings: "0244", credits: "0245",
  volumeMenu: "0247", volumeGame: "0248", restoreDefaults: "0032", resolution: "0240", smoothing: "0236",
  gameScreen: "0237", displayArea: "0249", wallpaper: "0235", screenFilter: "0238", windowMode: "0239",
  headingOptions: "0008", headingGameSelection: "0004", headingLanguage: "0053", headingAudio: "0055",
  headingScreen: "0057", headingButtonSettings: "0064",
} as const;

export const MGS1_LABEL_SPRITES: Record<string, string> = {
  "Start Game": "0083", "Game Selection": "0282", Options: "0286", "Quit Game": "0288", "QUIT GAME": "0288",
  Language: "0234", Screen: "0242", Audio: "0246", Notices: "0243", "Button Settings": "0244", Credits: "0245",
  "Volume(Main Menu)": "0247", "Volume(Game)": "0248", "Restore Defaults": "0032", "Resolution Settings": "0240",
  Smoothing: "0236", "Game Screen Settings": "0237", "Display Area": "0249", Wallpaper: "0235",
  "Screen Filter": "0238", "Window Mode": "0239",
  "Confirmation Button": "0031", Settings: "0038", "Current Settings": "0039",
  "Move cursor": "0081", Confirm: "0072", Back: "0079", Quit: "0080", Cancel: "0078", Mute: "0075",
  French: "0093", German: "0094", Italian: "0095", Spanish: "0096",
};

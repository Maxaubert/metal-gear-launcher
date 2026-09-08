import type { GameState } from "@shared/ipc";
import { preloadMgs1Typography } from "../typography/mgs1Typography";

const images = new Map<string, Promise<void>>();
const fonts = new Map<string, Promise<void>>();

function bounded<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Could not load ${label}. Please retry.`)), 15000);
  })]).finally(() => clearTimeout(timer));
}

function imageReady(url: string): Promise<void> {
  if (!images.has(url)) {
    const image = new Image();
    image.src = url;
    images.set(url, bounded(image.decode(), "game artwork").catch(error => {
      images.delete(url);
      throw error;
    }));
  }
  return images.get(url)!;
}

function fontReady(family: string, weight: string, url: string): Promise<void> {
  const key = `${family}:${weight}:${url}`;
  if (!fonts.has(key)) {
    const font = new FontFace(family, `url("${url}")`, { weight, display: "block" });
    fonts.set(key, bounded(font.load(), "menu fonts").then(loaded => {
      document.fonts.add(loaded);
    }).catch(error => { fonts.delete(key); throw error; }));
  }
  return fonts.get(key)!;
}

/** Decode every menu image and load the identical native Unity font files once. */
export async function preloadPresentation(games: readonly GameState[]): Promise<void> {
  const installed = games.filter(game => game.installed);
  const work: Promise<void>[] = [];
  const mgs1 = installed.find(game => game.pack.id === "mgs1");
  if (mgs1) work.push(bounded(preloadMgs1Typography(mgs1.assetUrls), "MGS1 lettering"));
  for (const url of new Set(installed.flatMap(game => Object.values(game.assetUrls)))) {
    if (/\.(png|jpe?g|webp|svg)(?:\?|$)/i.test(url)) work.push(imageReady(url));
  }
  for (const [role, family, weight] of [
    ["fontUi", "MenuEnglish", "400"], ["fontMedium", "Rodin", "400"], ["fontBold", "Rodin", "700"],
  ] as const) {
    const url = installed.find(game => game.assetUrls[role])?.assetUrls[role];
    if (url) work.push(fontReady(family, weight, url));
  }
  await Promise.all(work);
  await bounded(document.fonts.ready, "menu fonts");
}

import { join } from "node:path";
import sharp from "sharp";
import { spriteRect } from "../extract/m2";
import { BonusCache, bonusResource, type DecodedBonus } from "./cache";
import { allowBonusFile } from "./media";
import { cachedBonusPng } from "./png";

async function sprite(decoded: DecodedBonus, texture: string, id: string): Promise<string> {
  const file = join(decoded.directory, `${texture}-${id}.png`);
  return cachedBonusPng(file, async () => sharp(await bonusResource(decoded, `${texture}-texture.png`)).extract(spriteRect(decoded.json, texture, id)).png().toBuffer());
}

export async function bonusArtwork(cache: BonusCache): Promise<Record<string, string>> {
  const decoded = await cache.decode("system/motion/outgame_menu_main.psb.m");
  const mappings: Record<string, string> = cache.install.id === "vol1"
    ? { logo: "0020", rightBackground: "0004", rightVisual: "0023", rightVisual2: "0005", video1: "0035", video2: "0040", banner1en: "0042", banner2en: "0044", banner1jp: "0032", banner2jp: "0037", videoLogo1en: "0034", videoLogo2en: "0039", videoLogo1jp: "0033" }
    : { mainVisual: "0010", logo: "0013", rightVisual: "0001" };
  const result: Record<string, string> = {};
  for (const [key, id] of Object.entries(mappings)) result[key] = await allowBonusFile(await sprite(decoded, "tex#000", id), cache.directory, "image/png");
  if (cache.install.id === "vol1") {
    result.videoLogo2jp = await allowBonusFile(await sprite(decoded, "tex#001", "0038"), cache.directory, "image/png");
    const header = join(decoded.directory, "bonus-header.png");
    await cachedBonusPng(header, async () => sharp(await sprite(decoded, "tex#000", "0004")).extract({ left: 0, top: 510, width: 736, height: 140 }).png().toBuffer());
    result.header = await allowBonusFile(header, cache.directory, "image/png");
    // The native main visual consists of four adjacent 195px strips.
    const file = join(decoded.directory, "main-visual.png");
    await cachedBonusPng(file, async () => {
      const strips = await Promise.all(["0000", "0001", "0002", "0003"].map((id, index) => sprite(decoded, index ? "tex#001" : "tex#000", id)));
      return sharp({ create: { width: 780, height: 1408, channels: 4, background: "transparent" } })
        .composite(strips.map((input, index) => ({ input, left: index * 195, top: 0 }))).png().toBuffer();
    });
    result.mainVisual = await allowBonusFile(file, cache.directory, "image/png");
  } else {
    const background = await sprite(decoded, "tex#001", "0000");
    result.rightBackground = await allowBonusFile(background, cache.directory, "image/png");
    const header = await cachedBonusPng(join(decoded.directory, "bonus-header.png"), async () => sharp(background)
      .extract({ left: 0, top: 510, width: 764, height: 140 }).png().toBuffer());
    result.header = await allowBonusFile(header, cache.directory, "image/png");
  }
  return result;
}

export async function bonusSleeve(cache: BonusCache, index: number): Promise<string> {
  const prefix = cache.install.id === "vol1" ? "201" : "777";
  const decoded = await cache.decode(`${prefix}/image/sleeve_${String(index).padStart(2, "0")}.psb.m`);
  const file = await bonusResource(decoded);
  await sharp(file).metadata();
  return allowBonusFile(file, cache.directory, "image/png");
}

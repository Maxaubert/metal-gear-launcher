import type { BonusVideo } from "@shared/bonus";

export interface BonusVideoChoice {
  id: string;
  title: string;
  language: BonusVideo["language"];
  video?: BonusVideo;
}

const knownVideos: BonusVideoChoice[] = ["BD1_en", "BD2_en", "BD1_jp", "BD2_jp"].map(key => ({
  id: `vol1-${key}`,
  title: `Metal Gear Solid${key.startsWith("BD2") ? " 2" : ""}: Digital Graphic Novel (${key.endsWith("en") ? "English" : "Japanese"})`,
  language: key.endsWith("en") ? "en" : "jp",
}));

/** Missing titles remain discoverable without creating media URLs or playable placeholders. */
export function bonusVideoCatalog(installed: BonusVideo[]): BonusVideoChoice[] {
  const byId = new Map(installed.map(video => [video.id, video]));
  const choices = knownVideos.map(known => {
    const video = byId.get(known.id); byId.delete(known.id);
    return video ? { id: video.id, title: video.title, language: video.language, video: video.url ? video : undefined } : { ...known };
  });
  return [...choices, ...[...byId.values()].map(video => ({ id: video.id, title: video.title, language: video.language, video: video.url ? video : undefined }))];
}

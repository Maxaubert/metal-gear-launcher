import { expect, it } from "vitest";
import type { BonusVideo } from "../shared/bonus";
import { bonusVideoCatalog } from "../src/bonus/videoCatalog";

const video = (id: string): BonusVideo => ({ id, title: `Installed ${id}`, language: "en", volume: "vol1", url: "hub-bonus://fixture", duration: 100, chapters: [0, 25] });

it("keeps all four known video choices discoverable with no playable placeholders", () => {
  const catalog = bonusVideoCatalog([]);
  expect(catalog.map(row => row.id)).toEqual(["vol1-BD1_en", "vol1-BD2_en", "vol1-BD1_jp", "vol1-BD2_jp"]);
  expect(catalog.every(row => row.video === undefined && !("url" in row))).toBe(true);
  expect(catalog.map(row => row.language)).toEqual(["en", "en", "jp", "jp"]);
});
it("merges installed native videos into their fixed rows and preserves extra library entries", () => {
  const installed = video("vol1-BD2_en"); const extra = video("custom-video");
  const catalog = bonusVideoCatalog([extra, installed]);
  expect(catalog).toHaveLength(5); expect(catalog[1]?.video).toBe(installed); expect(catalog[1]?.title).toBe(installed.title);
  expect(catalog[4]?.video).toBe(extra); expect(catalog[0]?.video).toBeUndefined();
});
it("treats entries without media URLs as unavailable and never duplicates known IDs", () => {
  const missing = { ...video("vol1-BD1_en"), url: "" };
  const catalog = bonusVideoCatalog([missing, missing]);
  expect(catalog).toHaveLength(4); expect(catalog[0]?.video).toBeUndefined();
});

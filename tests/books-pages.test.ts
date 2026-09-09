import { describe, expect, it } from "vitest";
import { nativeContents, pageAssets, readerPages } from "../electron/main/books/pages";
import type { NativeBook } from "../electron/main/books/native";

function book(overrides: Partial<NativeBook> = {}): NativeBook { return { pages: [], index: [], text: [], backgrounds: [], mapping: {}, ...overrides }; }
describe("native book navigation", () => {
  it("omits the duplicate reset cover but preserves native spread IDs and every index target", () => {
    const data = book({ pages: [{ pageNo: 0 }, { pageNo: 1 }, { pageNo: 2 }, { pageNo: 4 }], index: [{ pageNo: 1, text: "Cover" }, { pageNo: 4, text: "Chapter" }, { pageNo: 4, text: "Scene" }, { pageNo: 8, text: "Unavailable" }] });
    const pages = readerPages(data, "master");
    expect(pages.map(row => row.pageNo)).toEqual([1, 2, 4]);
    expect(nativeContents(data, pages)).toEqual([{ title: "Cover", page: 0 }, { title: "Chapter", page: 2 }, { title: "Scene", page: 2 }]);
  });
  it("uses screenplay text records instead of sparse frame changes or source offsets", () => {
    const data = book({ pages: [{ pageNo: 0 }, { pageNo: 4 }], text: [{ pageNo: 1, startPoint: 0 }, { pageNo: 2, startPoint: 56 }, { pageNo: 3, startPoint: 80 }, { pageNo: 4, startPoint: 107 }] });
    expect(readerPages(data, "screenplay").map(row => row.pageNo)).toEqual([1, 2, 3, 4]);
  });
  it("inherits sparse frame and left/right artwork separately and honors explicit clearing", () => {
    const data = book({ pages: [{ pageNo: 0, backgroundImage: "reset" }, { pageNo: 1, backgroundImage: "cover" }, { pageNo: 2, backgroundImage: "frame" }], backgrounds: [
      { pageNo: 2, nextgroupid: 0, text: "chapter-left" }, { pageNo: 2, nextgroupid: 1, text: "chapter-right" },
      { pageNo: 3, nextgroupid: 1, text: "character" }, { pageNo: 5, nextgroupid: 0, text: "null_pic" },
    ] });
    expect(pageAssets(data, 4, "mgs2")).toEqual({ base: "frame", artwork: ["chapter-left", "character"] });
    expect(pageAssets(data, 6, "mgs2").artwork).toEqual(["null_pic", "character"]);
  });
  it("uses MGS1's groupid, not its background row number, for background inheritance", () => {
    const data = book({ backgrounds: [{ pageNo: 2, groupid: 2, nextgroupid: 0, text: "left" }, { pageNo: 3, groupid: 2, nextgroupid: 1, text: "right" }, { pageNo: 4, groupid: 3, nextgroupid: 0, text: "later" }] });
    expect(pageAssets(data, 2, "mgs1").artwork).toEqual(["left", "right"]);
  });
});

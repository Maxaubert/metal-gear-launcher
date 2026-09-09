import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
import { bookImageIdentity, referencedBookImages } from "../electron/main/books/prepare";
it("plans unique referenced images, including sparse frames, instead of every screenplay record", () => {
  const images = referencedBookImages({ pages: [{ pageNo: 0, backgroundImage: "frame" }, { pageNo: 1, backgroundImage: "cover" }, { pageNo: 2, backgroundImage: "frame" }],
    text: [{ pageNo: 1 }, { pageNo: 2 }, { pageNo: 3 }], index: [], mapping: { unused: "never-requested" }, backgrounds: [{ pageNo: 1, text: "null_pic" }, { pageNo: 2, text: "character" }, { pageNo: 3, text: "character" }] });
  expect(images).toEqual(["frame", "cover", "character"]);
  const request = { gameId: "mgs1", kind: "screenplay", language: "en" } as const;
  expect(bookImageIdentity(request, "left", { left: "shared", right: "shared" })).toBe(bookImageIdentity({ ...request, language: "jp" }, "right", { left: "shared", right: "shared" }));
  expect(bookImageIdentity({ ...request, gameId: "mgs4" }, "johhny", {})).toBe(bookImageIdentity({ ...request, gameId: "mgs4" }, "johnny", {}));
});

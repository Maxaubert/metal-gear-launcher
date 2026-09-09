import { it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bonusResponse, byteRange } from "../electron/main/bonus/response";

it("validates closed, open and suffix byte ranges including unsatisfiable input", () => {
  expect(byteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
  expect(byteRange("bytes=80-", 100)).toEqual({ start: 80, end: 99 });
  expect(byteRange("bytes=-5", 100)).toEqual({ start: 95, end: 99 });
  expect(byteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
  for (const header of ["bytes=100-", "bytes=20-10", "bytes=-0", "bytes=-", "bytes=0-1,4-5", "bytes=9007199254740992-"]) expect(byteRange(header, 100)).toBeNull();
});

it("serves only the requested bytes with correct lengths and HEAD metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-bonus-range-"));
  try {
    const file = join(root, "video");
    await writeFile(file, Buffer.from(Array.from({ length: 100 }, (_, index) => index)));
    const request = new Request("https://fixture", { headers: { Range: "bytes=10-19" } });
    const response = await bonusResponse(request, file, "video/mp4");
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 10-19/100");
    expect(response.headers.get("Content-Length")).toBe("10");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const head = await bonusResponse(new Request("https://fixture", { method: "HEAD" }), file, "video/mp4");
    expect(head.headers.get("Content-Length")).toBe("100");
    expect(head.body).toBeNull();
    const invalid = await bonusResponse(new Request("https://fixture", { headers: { Range: "bytes=100-" } }), file, "video/mp4");
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("Content-Range")).toBe("bytes */100");
  } finally { await rm(root, { recursive: true, force: true }); }
});

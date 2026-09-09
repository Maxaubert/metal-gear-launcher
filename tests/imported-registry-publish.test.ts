import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
import { publishImportedRegistry } from "../electron/main/books/imported-registry";

let root: string; let current: string; let temporary: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "personal-registry-publish-"));
  current = join(root, "library.json"); temporary = join(root, "library.json.tmp");
  await writeFile(current, "old registry"); await writeFile(temporary, "new registry");
  vi.mocked(rename).mockClear();
});
afterEach(async () => { vi.mocked(rename).mockReset(); await rm(root, { recursive: true, force: true }); });

it("retries temporary Windows sharing failures then atomically replaces the registry", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error("scanner busy"), { code: "EPERM" }))
    .mockRejectedValueOnce(Object.assign(new Error("scanner busy"), { code: "EBUSY" })).mockImplementation(actual.rename);
  await publishImportedRegistry(temporary, current, "win32");
  expect(rename).toHaveBeenCalledTimes(3);
  expect(await readFile(current, "utf8")).toBe("new registry");
  await expect(readFile(temporary)).rejects.toMatchObject({ code: "ENOENT" });
});

it("stops after bounded retries and retains the existing registry on permanent failure", async () => {
  const denied = Object.assign(new Error("permanent denial"), { code: "EACCES" });
  vi.mocked(rename).mockRejectedValue(denied);
  await expect(publishImportedRegistry(temporary, current, "win32")).rejects.toBe(denied);
  expect(rename).toHaveBeenCalledTimes(6);
  expect(await readFile(current, "utf8")).toBe("old registry");
  expect(await readFile(temporary, "utf8")).toBe("new registry");
});

it("does not retry unrelated filesystem failures or non-Windows permission errors", async () => {
  const missing = Object.assign(new Error("missing source"), { code: "ENOENT" });
  vi.mocked(rename).mockRejectedValue(missing);
  await expect(publishImportedRegistry(temporary, current, "win32")).rejects.toBe(missing);
  expect(rename).toHaveBeenCalledTimes(1);
  const denied = Object.assign(new Error("denied"), { code: "EPERM" });
  vi.mocked(rename).mockClear().mockRejectedValue(denied);
  await expect(publishImportedRegistry(temporary, current, "linux")).rejects.toBe(denied);
  expect(rename).toHaveBeenCalledTimes(1);
  expect(await readFile(current, "utf8")).toBe("old registry");
});

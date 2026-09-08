import { describe, expect, it, vi } from "vitest";
import { checkForUpdate } from "../electron/main/update";

function fakeFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
}

describe("checkForUpdate", () => {
  it("returns update info when the latest tag is newer than the current version", async () => {
    const fetchImpl = fakeFetch({ tag_name: "v0.2.0", html_url: "https://example.com/releases/v0.2.0" });
    expect(await checkForUpdate("0.1.0", fetchImpl)).toEqual({
      version: "0.2.0",
      url: "https://example.com/releases/v0.2.0",
    });
  });

  it("returns null when already on the latest version", async () => {
    const fetchImpl = fakeFetch({ tag_name: "v0.1.0", html_url: "https://example.com/releases/v0.1.0" });
    expect(await checkForUpdate("0.1.0", fetchImpl)).toBeNull();
  });

  it("returns null on a non-ok response instead of throwing", async () => {
    const fetchImpl = fakeFetch({}, false);
    expect(await checkForUpdate("0.1.0", fetchImpl)).toBeNull();
  });

  it("returns null on a malformed body instead of throwing", async () => {
    const fetchImpl = fakeFetch({ nope: true });
    expect(await checkForUpdate("0.1.0", fetchImpl)).toBeNull();
  });

  it("returns null when the fetch itself rejects (network failure or timeout)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await checkForUpdate("0.1.0", fetchImpl)).toBeNull();
  });
});

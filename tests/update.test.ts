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
    expect(fetchImpl).toHaveBeenCalledWith("https://api.github.com/repos/Maxaubert/metal-gear-launcher/releases/latest", expect.any(Object));
  });

  it("returns null when already on the latest version", async () => {
    const fetchImpl = fakeFetch({ tag_name: "v0.1.0", html_url: "https://example.com/releases/v0.1.0" });
    expect(await checkForUpdate("0.1.0", fetchImpl)).toBeNull();
  });

  it.each([
    ["0.3.0", "v0.2.0", false],
    ["0.9.0", "v0.10.0", true],
    ["0.10.0", "v0.9.0", false],
    ["1.0.0", "v0.99.99", false],
    ["0.3.0", "v0.3.1", true],
    ["0.3.0", "v0.4.0-beta.1", false],
    ["0.3.0-beta.1", "v0.3.0", true],
    ["0.3.0+local", "v0.3.0+release", false],
    ["0.3.0", "latest", false],
    ["0.3.0", "v0.04.0", false],
    ["invalid", "v0.4.0", false],
  ])("compares installed %s with tag %s numerically (update=%s)", async (current, latest, update) => {
    const result = await checkForUpdate(current, fakeFetch({ tag_name: latest, html_url: "https://example.com/release" }));
    expect(result !== null).toBe(update);
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

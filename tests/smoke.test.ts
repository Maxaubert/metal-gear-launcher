import { describe, expect, it } from "vitest";
import { ASSET_PROTOCOL } from "../shared/ipc";

describe("scaffold", () => {
  it("exposes the asset protocol name", () => {
    expect(ASSET_PROTOCOL).toBe("hub-asset");
  });
});

import { expect, it } from "vitest";
import { withBookDecoderSlot } from "../electron/main/books/decoders";

it("limits concurrent native decoders and releases queued work after failures", async () => {
  let active = 0; let peak = 0; let calls = 0;
  const releases: (() => void)[] = [];
  const jobs = Array.from({ length: 12 }, (_, index) => withBookDecoderSlot(async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise<void>(resolve => releases.push(resolve)); active--;
    if (index === 1) throw new Error("fixture failure");
    return index;
  }));
  const completed = Promise.allSettled(jobs);
  expect(calls).toBe(4);
  for (let batch = 0; batch < 3; batch++) {
    for (const release of releases.splice(0)) release();
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  const results = await completed;
  expect(peak).toBe(4); expect(calls).toBe(12);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect(await withBookDecoderSlot(async () => "ready")).toBe("ready");
});

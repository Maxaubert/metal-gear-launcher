/// <reference lib="dom" />
import { afterEach, expect, it, vi } from "vitest";
import { mgs1Typography, preloadMgs1Typography } from "../src/typography/mgs1Typography";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("aborts a hung metadata request and allows a fresh retry", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetch = vi.fn().mockImplementationOnce((_url: string, options: RequestInit) => {
    signal = options.signal as AbortSignal;
    return new Promise(() => {});
  }).mockResolvedValueOnce({ ok: true, json: async () => ({ kind: "sprites", width: 64, height: 32, sprites: {} }) });
  vi.stubGlobal("fetch", fetch);
  const urls = { nativeTextMetrics: "hub-asset://mgs1/timeout-retry.json" };
  const first = preloadMgs1Typography(urls);
  const rejected = expect(first).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(12000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(mgs1Typography(urls)).toBeUndefined();
  await preloadMgs1Typography(urls);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(mgs1Typography(urls)?.text?.width).toBe(64);
  expect(vi.getTimerCount()).toBe(0);
});

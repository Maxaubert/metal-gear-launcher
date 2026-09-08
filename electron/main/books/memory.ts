import { stat } from "node:fs/promises";

export async function memoryStamp(file: string): Promise<{ identity: string; size: number }> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Book cache file is unavailable");
  return { identity: `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`, size: info.size };
}

/** Parsed metadata only, never decoded pixels. Every hit checks the file's current identity. */
export function createBookMemory(maxBytes = 64 * 1024 * 1024, maxEntries = 128) {
  const entries = new Map<string, { identity: string; value: unknown; bytes: number }>();
  const pending = new Map<string, { identity: string; promise: Promise<unknown> }>();
  let bytes = 0;
  function remove(key: string) { const item = entries.get(key); if (item) { bytes -= item.bytes; entries.delete(key); } }
  return async function remember<T>(file: string, format: string, load: () => Promise<T>): Promise<T> {
    const key = `${format}\0${file}`;
    let stamp: Awaited<ReturnType<typeof memoryStamp>>;
    try { stamp = await memoryStamp(file); } catch (error) { remove(key); throw error; }
    const cached = entries.get(key);
    if (cached?.identity === stamp.identity) { entries.delete(key); entries.set(key, cached); return cached.value as T; }
    remove(key);
    const existing = pending.get(key);
    if (existing?.identity === stamp.identity) return existing.promise as Promise<T>;
    const promise = (async () => {
      const value = await load();
      if ((await memoryStamp(file)).identity !== stamp.identity) throw new Error("Book metadata changed while reading. Retry this page.");
      // JSON objects and UTF-16 strings take more space than their UTF-8 source file.
      const cost = stamp.size * 4 + 512;
      if (cost <= maxBytes) {
        remove(key);
        while (entries.size && (bytes + cost > maxBytes || entries.size >= maxEntries)) remove(entries.keys().next().value!);
        entries.set(key, { identity: stamp.identity, value, bytes: cost }); bytes += cost;
      }
      return value;
    })();
    pending.set(key, { identity: stamp.identity, promise });
    try { return await promise; } finally { if (pending.get(key)?.promise === promise) pending.delete(key); }
  };
}

export const rememberBookFile = createBookMemory();

const limit = 4;
let active = 0;
const waiting: (() => void)[] = [];

/** Bound native subprocesses even when several books or uncached pages are requested together. */
export async function withBookDecoderSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (active >= limit) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try { return await operation(); }
  finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

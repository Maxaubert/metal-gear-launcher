import type { BookPage } from "@shared/books";

export type PreparedPage = { page: BookPage; images: unknown[]; bytes: number };
type Entry = { index: number; promise: Promise<PreparedPage>; resolve: (page: PreparedPage) => void; reject: (error: unknown) => void; started: boolean; value?: PreparedPage };

/** A small decoded window, with the latest requested page ahead of speculative work. */
export class PageWindow {
  private entries = new Map<number, Entry>();
  private queue: Entry[] = [];
  private active = 0;
  private anchor = 0;
  private closed = false;
  private controller = new AbortController();
  constructor(private load: (index: number, signal: AbortSignal) => Promise<PreparedPage>, private budget = 128 * 1024 * 1024) {}

  focus(index: number, count: number) {
    this.anchor = index;
    const wanted = [index, index + 1, index - 1, index + 2, index + 3, index - 2, index + 4, index + 5, index + 6]
      .filter(page => page >= 0 && page < count);
    for (const [page, entry] of this.entries) if (!wanted.includes(page)) {
      this.entries.delete(page);
      if (!entry.started) entry.reject(new Error("Page request superseded"));
    }
    this.queue = [];
    for (const page of wanted) {
      const entry = this.entry(page);
      if (!entry.started) this.queue.push(entry);
    }
    this.trim();
    this.pump();
  }

  peek(index: number) { return this.entries.get(index)?.value?.page; }
  get(index: number) { return this.entry(index).promise; }
  retry(index: number, count: number) { this.entries.delete(index); this.focus(index, count); }
  dispose() {
    this.closed = true;
    this.controller.abort();
    for (const entry of this.queue) entry.reject(new Error("Book closed"));
    this.queue = []; this.entries.clear();
  }
  private entry(index: number): Entry {
    const existing = this.entries.get(index);
    if (existing) return existing;
    let resolve!: Entry["resolve"], reject!: Entry["reject"];
    const promise = new Promise<PreparedPage>((yes, no) => { resolve = yes; reject = no; });
    // Speculative failures are reported only if that page is actually requested.
    void promise.catch(() => undefined);
    const entry = { index, promise, resolve, reject, started: false };
    this.entries.set(index, entry);
    return entry;
  }
  private pump() {
    while (!this.closed && this.active < 2 && this.queue.length) {
      const entry = this.queue.shift()!;
      entry.started = true; this.active++;
      void this.load(entry.index, this.controller.signal).then(value => {
        if (!this.closed && this.entries.get(entry.index) === entry) entry.value = value;
        entry.resolve(value); this.trim();
      }, entry.reject).finally(() => { this.active--; this.pump(); });
    }
  }
  private trim() {
    let bytes = [...this.entries.values()].reduce((total, entry) => total + (entry.value?.bytes ?? 0), 0);
    const distant = [...this.entries.values()].filter(entry => entry.value && entry.index !== this.anchor)
      .sort((a, b) => Math.abs(b.index - this.anchor) - Math.abs(a.index - this.anchor));
    for (const entry of distant) {
      if (bytes <= this.budget) break;
      bytes -= entry.value!.bytes;
      this.entries.delete(entry.index);
    }
  }
}

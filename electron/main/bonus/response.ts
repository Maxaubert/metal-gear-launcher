import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return null;
  if (first === undefined) return last && last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
  const end = Math.min(last ?? size - 1, size - 1);
  return first < size && first <= end ? { start: first, end } : null;
}

/** Chromium's file fetch drops Range headers. Serve bounded streams for movie seeking. */
export async function bonusResponse(request: Request, file: string, contentType: string): Promise<Response> {
  const { size } = await stat(file);
  const rangeHeader = request.headers.get("Range");
  const range = rangeHeader ? byteRange(rangeHeader, size) : undefined;
  const headers = new Headers({ "Content-Type": contentType, "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  if (range === null) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range ? range.end - range.start + 1 : size));
  const body = request.method === "HEAD" ? null : Readable.toWeb(createReadStream(file, range ? { start: range.start, end: range.end } : undefined)) as ReadableStream;
  return new Response(body, { status: range ? 206 : 200, headers });
}

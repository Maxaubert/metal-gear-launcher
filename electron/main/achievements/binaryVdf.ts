export type BinaryNode = { [key: string]: string | number | BinaryNode };

/** Steam's local stats cache uses binary KeyValues, not the text VDF parser. */
export function parseBinaryVdf(buffer: Buffer): BinaryNode {
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Steam stats cache is too large");
  let cursor = 0, entries = 0;
  function take(bytes: number) {
    if (cursor + bytes > buffer.length) throw new Error("Truncated Steam stats cache");
    const start = cursor; cursor += bytes; return start;
  }
  function string() {
    const end = buffer.indexOf(0, cursor);
    if (end < 0) throw new Error("Unterminated Steam stats string");
    const value = buffer.toString("utf8", cursor, end); cursor = end + 1; return value;
  }
  function object(depth: number): BinaryNode {
    if (depth > 20) throw new Error("Steam stats cache is too deeply nested");
    const result: BinaryNode = Object.create(null);
    while (cursor < buffer.length) {
      const type = buffer[take(1)];
      if (type === 8) return result;
      if (++entries > 100000) throw new Error("Steam stats cache has too many entries");
      const key = string();
      if (type === 0) result[key] = object(depth + 1);
      else if (type === 1) result[key] = string();
      else if (type === 2) result[key] = buffer.readInt32LE(take(4));
      else if (type === 3) result[key] = buffer.readFloatLE(take(4));
      else if (type === 7) result[key] = String(buffer.readBigUInt64LE(take(8)));
      else throw new Error(`Unsupported Steam stats field ${type}`);
    }
    throw new Error("Unterminated Steam stats object");
  }
  return object(0);
}
export const node = (value: BinaryNode[string] | undefined): BinaryNode => typeof value === "object" && value !== null ? value : {};

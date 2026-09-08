/** A lossless INI editor. Unknown lines and original encoding are retained verbatim. */
export type IniValue = { section: string; key: string; value: string };
type Entry = { index: number; prefix: string; suffix: string; value: string };
const identity = (section: string, key: string): string => JSON.stringify([section, key]);

export class IniDocument {
  private readonly lines: string[];
  private readonly endings: string[];
  private readonly entries = new Map<string, Entry>();
  private readonly sections = new Map<string, number>();
  private readonly encoding: "utf8" | "utf16le";
  private readonly bom: Buffer;
  private readonly newline: string;

  constructor(original: Buffer) {
    this.encoding = original[0] === 0xff && original[1] === 0xfe ? "utf16le" : "utf8";
    const bomLength = this.encoding === "utf16le" ? 2 : original.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
    this.bom = original.subarray(0, bomLength);
    const text = new TextDecoder(this.encoding === "utf16le" ? "utf-16le" : "utf-8", { fatal: true }).decode(original.subarray(bomLength));
    if (text.includes("\0")) throw new Error("The settings file contains binary data.");
    this.lines = text.split(/\r\n|\n|\r/);
    this.endings = text.match(/\r\n|\n|\r/g) ?? [];
    this.newline = this.endings[0] ?? "\r\n";
    let section = "";
    for (const [index, line] of this.lines.entries()) {
      if (/^\s*(?:[;#].*)?$/.test(line)) continue;
      const header = /^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/.exec(line);
      if (header) {
        section = header[1]!.trim();
        if (this.sections.has(section)) throw new Error(`Duplicate settings section: ${section}`);
        this.sections.set(section, index);
        continue;
      }
      const match = /^(\s*([^=]+?)\s*=\s*)(.*)$/.exec(line);
      if (!match || !section) throw new Error(`Malformed INI line ${index + 1}.`);
      const raw = match[3]!;
      let quoted = false;
      let commentAt = raw.length;
      for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        if (char === '"' && (i === 0 || raw[i - 1] !== "\\")) quoted = !quoted;
        if (!quoted && (char === ";" || char === "#") && (i === 0 || /\s/.test(raw[i - 1]!))) { commentAt = i; break; }
      }
      if (quoted) throw new Error(`Unclosed quoted value on INI line ${index + 1}.`);
      const value = raw.slice(0, commentAt).trimEnd();
      const key = match[2]!.trim();
      const id = identity(section, key);
      if (this.entries.has(id)) throw new Error(`Duplicate settings key: ${section}/${key}`);
      this.entries.set(id, { index, prefix: match[1]!, suffix: raw.slice(value.length), value });
    }
  }

  get(section: string, key: string): string | undefined {
    return this.entries.get(identity(section, key))?.value;
  }

  edit(changes: IniValue[]): Buffer {
    const replacements = new Map<number, string>();
    const additions = new Map<string, string[]>();
    const changed = new Set<string>();
    for (const { section, key, value } of changes) {
      if (/[\r\n\0]/.test(section + key + value) || /[\[\]]/.test(section) || key.includes("=")) throw new Error("Invalid INI edit.");
      const id = identity(section, key);
      if (changed.has(id)) throw new Error(`Duplicate settings change: ${key}`);
      changed.add(id);
      const entry = this.entries.get(id);
      if (entry) replacements.set(entry.index, entry.prefix + value + entry.suffix);
      else additions.set(section, [...(additions.get(section) ?? []), `${key}=${value}`]);
    }
    // Insertion immediately after a section header cannot move another section's keys.
    let result = "";
    const byIndex = new Map([...this.sections].map(([section, index]) => [index, section]));
    this.lines.forEach((line, index) => {
      result += replacements.get(index) ?? line;
      const section = byIndex.get(index);
      const added = section ? additions.get(section) : undefined;
      const ending = this.endings[index] ?? "";
      if (added) {
        result += (ending || this.newline) + added.join(this.newline) + this.newline;
        additions.delete(section!);
      } else result += ending;
    });
    for (const [section, added] of additions) {
      if (result && !/[\r\n]$/.test(result)) result += this.newline;
      if (result) result += this.newline;
      result += `[${section}]${this.newline}${added.join(this.newline)}${this.newline}`;
    }
    return Buffer.concat([this.bom, Buffer.from(result, this.encoding)]);
  }
}

export function unquoteIni(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/\\"/g, '"') : value;
}

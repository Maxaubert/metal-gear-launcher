export type BookMarkupNode = string | { tag: "b" | "i" | "u" | "s" | "sup" | "sub" | "span" | "br"; children: BookMarkupNode[]; size?: number; space?: number; gap?: number; offset?: number; advance?: number; nowrap?: boolean };

function length(value: string | undefined): number | undefined {
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|em)?$/i.exec(value ?? "");
  if (!match) return undefined;
  return Math.max(-24, Math.min(24, Number(match[1]) / (match[2]?.toLowerCase() === "em" ? 1 : 24)));
}

function entities(text: string): string {
  const names: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, name: string) => {
    if (!name.startsWith("#")) return names[name.toLowerCase()] ?? original;
    const code = name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : original;
  });
}

/** Native Unity/M2 formatting becomes React text and allowlisted nodes, never HTML. */
export function parseBookMarkup(markup: string): BookMarkupNode[] {
  const root: BookMarkupNode[] = [];
  const stack: { name: string; children: BookMarkupNode[] }[] = [{ name: "root", children: root }];
  const tokens = markup.slice(0, 500_000).match(/<size=0><voffset=[^>]+><br\s*\/?><\/voffset><\/size>|<[^>]*>|[^<]+|</gi) ?? [];
  for (const token of tokens) {
    const children = stack[stack.length - 1]!.children;
    const gap = /^<size=0><voffset=([^>]+)><br\s*\/?><\/voffset><\/size>$/i.exec(token);
    if (gap) { children.push({ tag: "span", children: [], gap: length(gap[1]) ?? 0 }); continue; }
    const match = /^<(\/)?([a-z]+)(?:=([^>]+))?\s*\/?>$/i.exec(token);
    if (!match) { children.push(entities(token)); continue; }
    const name = match[2]!.toLowerCase();
    if (!["b", "i", "u", "s", "sup", "sub", "br", "size", "width", "voffset", "space", "color", "nobr", "mspace"].includes(name)) {
      children.push(entities(token)); continue;
    }
    if (match[1]) {
      const index = stack.map(entry => entry.name).lastIndexOf(name);
      if (index > 0) stack.length = index;
      continue;
    }
    if (name === "br") { children.push({ tag: "br", children: [] }); continue; }
    if (name === "space") {
      const space = length(match[3]);
      if (space !== undefined) children.push({ tag: "span", children: [], space });
      continue;
    }
    if (stack.length >= 32) continue;
    const node: Exclude<BookMarkupNode, string> = { tag: ["b", "i", "u", "s", "sup", "sub"].includes(name) ? name as "b" : "span", children: [] };
    if (name === "size") {
      const size = length(match[3]);
      if (size !== undefined && size > 0) node.size = Math.max(.25, Math.min(2, size));
    }
    if (name === "voffset") node.offset = length(match[3]);
    if (name === "mspace") node.advance = length(match[3]);
    if (name === "nobr") node.nowrap = true;
    children.push(node);
    stack.push({ name, children: node.children });
  }
  return root;
}

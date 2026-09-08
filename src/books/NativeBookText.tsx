import { createElement, useMemo, type ReactNode } from "react";
import { parseBookMarkup, type BookMarkupNode } from "./bookMarkup";

function render(nodes: BookMarkupNode[]): ReactNode[] {
  return nodes.map((node, index) => typeof node === "string" ? node : createElement(node.tag, {
    key: index,
    style: node.gap !== undefined ? { display: "block", height: `${Math.max(0, node.gap)}em`, marginTop: node.gap < 0 ? `${node.gap}em` : undefined }
      : node.space !== undefined ? { display: "inline-block", width: `${Math.max(0, node.space)}em`, marginLeft: node.space < 0 ? `${node.space}em` : undefined }
        : { fontSize: node.size ? `${node.size}em` : undefined, verticalAlign: node.offset !== undefined ? `${node.offset}em` : undefined,
          letterSpacing: node.advance !== undefined ? `${node.advance - 1}em` : undefined, whiteSpace: node.nowrap ? "nowrap" : undefined },
  }, ...(node.tag === "br" ? [] : render(node.children))));
}

export default function NativeBookText({ markup }: { markup: string }) {
  return useMemo(() => <>{render(parseBookMarkup(markup))}</>, [markup]);
}

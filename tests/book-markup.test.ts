import { describe, expect, it } from "vitest";
import { parseBookMarkup, type BookMarkupNode } from "../src/books/bookMarkup";

const flatten = (nodes: BookMarkupNode[]): string => nodes.map(node => typeof node === "string" ? node : flatten(node.children)).join("");

describe("native book markup", () => {
  it("preserves native stage directions while creating only safe React nodes", () => {
    const input = '<b>SNAKE</b><br><off-screen>Test<img src=x onerror=alert(1)><script>alert(1)</script>';
    const parsed = parseBookMarkup(input);
    expect(parsed[0]).toEqual({ tag: "b", children: ["SNAKE"] });
    expect(parsed[1]).toEqual({ tag: "br", children: [] });
    expect(flatten(parsed)).toContain('<off-screen>Test<img src=x onerror=alert(1)><script>alert(1)</script>');
  });
  it("decodes entities as literal text without reparsing tags", () => {
    expect(parseBookMarkup('&lt;img src=x&gt; &amp; &#x65e5; &#26412; &#99999999;')).toEqual(['<img src=x> & 日 本 &#99999999;']);
  });
  it("preserves complementary native vertical spacers with their units", () => {
    expect(parseBookMarkup('<size=0><voffset=348.91px><br></voffset></size>')).toEqual([{ tag: "span", children: [], gap: 348.91 / 24 }]);
    expect(parseBookMarkup('<size=0><voffset=-0.5em><br></voffset></size>')).toEqual([{ tag: "span", children: [], gap: -.5 }]);
  });
  it("handles Japanese ruby spacing safely, including signed em values", () => {
    const parsed = parseBookMarkup('<nobr><mspace=1.2em>日本</mspace><space=-2em><size=7px><voffset=1em>にほん</voffset></size></nobr>');
    expect(flatten(parsed)).toBe("日本にほん");
    expect(parsed).toMatchObject([{ tag: "span", nowrap: true, children: [
      { tag: "span", advance: 1.2 }, { tag: "span", space: -2 }, { tag: "span", size: 7 / 24, children: [{ offset: 1 }] },
    ] }]);
  });
  it("drops unsafe attribute styling and bounds malformed inputs", () => {
    expect(parseBookMarkup('<size=999999999>large</size><space=expression(alert(1))>safe')).toEqual([{ tag: "span", size: 2, children: ["large"] }, "safe"]);
    expect(flatten(parseBookMarkup('<b>'.repeat(100) + 'end' + '</b>'.repeat(100)))).toBe("end");
  });
});

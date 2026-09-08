import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ScreenBackdrop from "../../src/screens/ScreenBackdrop";
import { loadPacks } from "@shared/packs";

describe("Peace Walker partial extraction", () => {
  const pack = loadPacks().find(p => p.id === "mgspw")!;
  it("keeps the other rings visible when the first ring could not be extracted", () => {
    const html = renderToStaticMarkup(<ScreenBackdrop pack={pack} assetUrls={{ reticle2: "second.png", reticle3: "third.png" }} />);
    expect(html).toContain('class="reticle reticle-2"');
    expect(html).toContain('class="reticle reticle-3"');
    expect(html).not.toContain('class="reticle reticle-1"');
  });
  it("still shows the mech when none of the rings were extracted", () => {
    const html = renderToStaticMarkup(<ScreenBackdrop pack={pack} assetUrls={{ bgEffect: "mech.png" }} />);
    expect(html).toContain('class="mech-backdrop"');
    expect(html).toContain('class="mech-frame mech-frame-1"');
  });
});

import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FooterHints, { ControlHint } from "../../src/screens/FooterHints";

describe("input-specific control hints", () => {
  it.each(["keyboard", "mouse"] as const)("shows readable keyboard keycaps for %s input", (lastInputKind) => {
    const markup = renderToStaticMarkup(<FooterHints lastInputKind={lastInputKind} />);
    for (const key of ["↑", "↓", "Enter", "Esc"]) {
      expect(markup).toContain(`<kbd class="control-keycap">${key}</kbd>`);
    }
    expect(markup).not.toContain("control-gamepad");
    expect(markup).toContain("Move cursor");
    expect(markup).toContain("Confirm");
    expect(markup).toContain("Back");
  });

  it("replaces keyboard legends with controller buttons", () => {
    const markup = renderToStaticMarkup(<FooterHints lastInputKind="gamepad" />);
    for (const key of ["L", "A", "B"]) {
      expect(markup).toContain(`<i class="control-gamepad">${key}</i>`);
    }
    expect(markup).not.toContain("<kbd");
  });

  it("uses the same keycaps for settings adjustment hints", () => {
    const markup = renderToStaticMarkup(<ControlHint lastInputKind="keyboard"
      keyboard={["←", "→"]} gamepad="L" label="Change" />);
    expect(markup).toContain('<kbd class="control-keycap">←</kbd>');
    expect(markup).toContain('<kbd class="control-keycap">→</kbd>');
    expect(markup).toContain("Change");
    expect(markup).not.toContain("control-gamepad");
  });
});

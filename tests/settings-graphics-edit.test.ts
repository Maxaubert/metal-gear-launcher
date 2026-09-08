import { describe, expect, it } from "vitest";
import type { GameSettings, SettingsChange, SettingsSection } from "../shared/settings";
import { graphicsEdit } from "../src/settings/graphicsEdit";

function fixture() {
  const launcher: SettingsSection = { id: "native-launcher", title: "Launcher", kind: "native", status: "ready", fields: [{
    id: "HiresoPreset", label: "Resolution Settings", category: "Screen", kind: "choice", value: 0,
    options: [
      { value: 0, label: "Original", fieldValues: { HiresoRender: 0, HiresoUpScale: 0, HiresoMovie: 0 } },
      { value: 1, label: "Adjusted", fieldValues: { HiresoRender: 1, HiresoUpScale: 3, HiresoMovie: 1 } },
      { value: 2, label: "Custom", fieldValues: { HiresoRender: 1, HiresoUpScale: 2, HiresoMovie: 1 } },
    ],
  }] };
  const game: SettingsSection = { id: "native-game", title: "Game", kind: "native", status: "ready", fields:
    ["HiresoRender", "HiresoUpScale", "HiresoMovie"].map(id => ({ id, label: id, category: "Screen", kind: "choice", value: 0 })) };
  const settings: GameSettings = { gameId: "mgs2", accounts: [], revision: "fixture", sections: [launcher, game] };
  return { launcher, game, settings };
}

describe("individual native graphics edits", () => {
  it("selects Custom and retains the displayed Original values instead of remembered custom settings", () => {
    const { game, settings } = fixture();
    const changes = graphicsEdit(settings, {}, game, game.fields[2]!, 1)!;
    expect(changes["native-launcher\nHiresoPreset"]?.value).toBe(2);
    expect(changes["native-game\nHiresoRender"]?.value).toBe(0);
    expect(changes["native-game\nHiresoUpScale"]?.value).toBe(0);
    expect(changes["native-game\nHiresoMovie"]?.value).toBe(1);
  });

  it("copies the pending automatic preset before applying the edit and preserves other drafts", () => {
    const { game, settings } = fixture();
    const pending: Record<string, SettingsChange> = {
      "native-launcher\nHiresoPreset": { sectionId: "native-launcher", fieldId: "HiresoPreset", value: 1 },
      "native-game\nSndMasterVol": { sectionId: "native-game", fieldId: "SndMasterVol", value: 7 },
    };
    const changes = graphicsEdit(settings, pending, game, game.fields[2]!, 0)!;
    expect(changes["native-game\nHiresoRender"]?.value).toBe(1);
    expect(changes["native-game\nHiresoUpScale"]?.value).toBe(3);
    expect(changes["native-game\nHiresoMovie"]?.value).toBe(0);
    expect(changes["native-game\nSndMasterVol"]?.value).toBe(7);
    expect(pending["native-launcher\nHiresoPreset"]?.value).toBe(1);
  });

  it("does not bypass unavailable native fields or reinterpret patch settings", () => {
    const { game, settings } = fixture();
    expect(graphicsEdit(settings, {}, game, { ...game.fields[0]!, readOnly: true }, 1)).toBeUndefined();
    expect(graphicsEdit(settings, {}, { ...game, kind: "patch" }, game.fields[0]!, 1)).toBeUndefined();
  });

  it.each([true, false])("retains explicit Original selection while child drafts remain (selectCustom=%s)", (selectCustom) => {
    const { launcher, game, settings } = fixture();
    const edited = graphicsEdit(settings, {}, game, game.fields[2]!, 1)!;
    const original = graphicsEdit(settings, edited, launcher, launcher.fields[0]!, 0, selectCustom)!;
    expect(original["native-launcher\nHiresoPreset"]?.value).toBe(0);
    expect(original["native-game\nHiresoMovie"]?.value).toBe(1);
    expect(edited["native-launcher\nHiresoPreset"]?.value).toBe(2);
  });

  it("does not retain a preset-only no-op because unrelated audio drafts exist", () => {
    const { launcher, settings } = fixture();
    const audio = { "native-game\nSndMasterVol": { sectionId: "native-game", fieldId: "SndMasterVol", value: 7 } };
    expect(graphicsEdit(settings, audio, launcher, launcher.fields[0]!, 0)).toBeUndefined();
  });

  it("stages the explicit Restore Defaults preset before individual defaults are added", () => {
    const { launcher, settings } = fixture();
    const reset = graphicsEdit(settings, {}, launcher, launcher.fields[0]!, 0, false)!;
    expect(reset["native-launcher\nHiresoPreset"]?.value).toBe(0);
  });
});

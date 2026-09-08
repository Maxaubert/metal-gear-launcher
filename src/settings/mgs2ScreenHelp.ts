import type { SettingValue } from "@shared/settings";

export function mgs2ScreenHelp(fieldId: string | undefined, preset: SettingValue, fieldValue?: SettingValue) {
  if (!fieldId || fieldId === "WindowMode") return { side: "", footer: "" };
  let side = "This setting can be changed prior to starting the game.";
  if (fieldId === "HiresoPreset") {
    if (preset === 1) side += '\n\nProduces a sharper picture than "Original Mode".';
    if (preset !== 0) side += "\n\nDepending on your setup, game performance may suffer when not set to Original Mode.\nShould you experience said instability, please change your settings back to Original Mode.";
  } else if (fieldId === "HiresoRender" && typeof fieldValue === "number" && fieldValue !== 0) {
    side += "\n\nSetting the game to anything other than the original resolution may result in unstable performance. Consider reverting to the original resolution if you experience any instability.";
  } else if (fieldId === "HiresoUpScale" && typeof fieldValue === "number" && fieldValue !== 0) {
    side += "\n\nSetting the game to anything other than the default resolution may result in unstable performance. Consider reverting to the default resolution if you experience any instability.";
  } else if (fieldId === "HiresoMovie" && fieldValue === 1) {
    side += "\n\nSome movie data will be played at a higher resolution.\n\nAvailable resolutions may differ depending on your setup.";
  }
  const presetFooter = preset === 0 ? "Picture displayed is the same as the original release."
    : preset === 1 ? "Display the game at the maximum possible resolution for your setup."
    : "Internal Resolution, Internal Upscaling, and Movie settings can be individually changed in accordance with your setup.";
  const descriptions: Record<string, string> = {
    HiresoPreset: presetFooter,
    HiresoRender: "Change the internal resolution.",
    HiresoUpScale: "Set the upscaling resolution.",
    HiresoMovie: "Change the movie data used.",
  };
  return { side, footer: descriptions[fieldId] ?? "" };
}

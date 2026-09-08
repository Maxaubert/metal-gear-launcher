import type { SettingValue } from "../../../shared/settings";

export type PatchFieldSchema = {
  id: string;
  section: string;
  key: string;
  label: string;
  category: string;
  games?: string[];
  kind: "toggle" | "range" | "choice" | "text";
  defaultValue: SettingValue;
  options?: SettingValue[];
  min?: number;
  max?: number;
  step?: number;
  hidden?: boolean;
  readOnly?: boolean;
  description?: string;
  validation?: "fov" | "cutsceneFov" | "fps" | "hotkey" | "hdHotkey";
};
export type PatchSchema = {
  id: string;
  title: string;
  versions: string[];
  fields: PatchFieldSchema[];
  format: "settings" | "ini" | "numericIni";
  message?: string;
};

const toggle = (section: string, key: string, label: string, defaultValue: boolean, hidden = false): PatchFieldSchema =>
  ({ id: `${section}/${key}`, section, key, label, category: section, kind: "toggle", defaultValue, hidden });
const range = (section: string, key: string, label: string, defaultValue: number, min: number, max: number, step = 1): PatchFieldSchema =>
  ({ id: `${section}/${key}`, section, key, label, category: section, kind: "range", defaultValue, min, max, step });

const m2Fields: PatchFieldSchema[] = [
  toggle("External Resolution", "Enabled", "Override display settings", true),
  range("External Resolution", "Width", "Window width (0 = desktop)", 0, 0, 16384),
  range("External Resolution", "Height", "Window height (0 = desktop)", 0, 0, 16384),
  toggle("External Resolution", "Windowed", "Windowed mode", false),
  toggle("External Resolution", "Borderless", "Borderless window", true),
  { ...toggle("Internal Resolution", "Widescreen", "Widescreen", false), description: "Requires Fullscreen screen mode in the game's display settings." },
  toggle("Internal Resolution", "Borderless", "Remove NTSC letterboxing", false),
  { ...toggle("Internal Resolution", "Enabled", "Override internal resolution", false), description: "Requires High or Max resolution in the game's display settings." },
  range("Internal Resolution", "Height", "Render height (0 = external)", 0, 0, 16384),
  toggle("Input", "RemoveDeadzone", "Remove analog stick deadzone", true),
  toggle("Launcher", "SkipNotice", "Skip notices and logos", true),
  toggle("Launcher", "StartGame", "Start game directly", false),
  toggle("Patches", "RemoveUnderpants", "Restore original Johnny textures", true),
  toggle("Patches", "EnableMosaic", "Restore mosaic effect", true),
  toggle("Patches", "RestoreGhosts", "Restore ghost effects", true),
  toggle("Patches", "RestoreMedicine", "Restore medicine textures", true),
  toggle("Patches", "DisableFont", "Disable HD font", false),
  toggle("Update Notifications", "CheckForUpdates", "Check for patch updates", true),
  toggle("Update Notifications", "ConsoleNotifications", "Show update notifications", true),
  toggle("Patches", "DisableRAM", "Disable RAM patches", false, true),
  toggle("Patches", "DisableCDROM", "Disable CD-ROM patches", false, true),
  toggle("Game", "StageSelect", "Developer stage select", false, true),
  toggle("Fixes", "DisableWindowsFullscreenOptimization", "Disable fullscreen optimization", false, true),
  toggle("Squirrel Debugger", "Enabled", "Squirrel debugger", false, true),
  { ...range("Squirrel Debugger", "Port", "Debugger port", 27615, 1, 65535), hidden: true },
  toggle("Squirrel Debugger", "AutoUpdate", "Debugger auto update", true, true),
  toggle("Squirrel Debugger", "Exclusive", "Exclusive debugger", false, true),
  ...["Level", "NativeLevel", "EmulatorLevel"].map(key => ({ ...range("Tracing", key, key, 0, 0, 10), hidden: true })),
  toggle("Tracing", "Console", "Debug console", false, true),
];

const sunnyFields: PatchFieldSchema[] = [
  toggle("Display", "Enabled", "Display fixes", true),
  range("Display", "Width", "Render width (0 = window)", 0, 0, 16384),
  range("Display", "Height", "Render height (0 = window)", 0, 0, 16384),
  range("Display", "RenderScale", "Render scale", 1, 0.25, 4, 0.05),
  { id: "Display/FieldOfView", section: "Display", key: "FieldOfView", label: "Field of view", category: "Display", kind: "text", defaultValue: "AUTO", validation: "fov", description: "AUTO, OFF, or a horizontal angle from 30 to 140 degrees." },
  { id: "Display/CutsceneFieldOfView", section: "Display", key: "CutsceneFieldOfView", label: "Cutscene field of view", category: "Display", kind: "text", defaultValue: "OFF", validation: "cutsceneFov", description: "AUTO, OFF, or a multiplier from 0.5 to 2. Wider framing can reveal objects outside the original shot." },
  { ...range("Display", "DynamicResolution", "Dynamic resolution", 0, -1, 1), kind: "choice", options: [-1, 0, 1], description: "-1 lets the game decide; 0 disables; 1 enables. PatriotFix can also override this." },
  toggle("Display", "KeepDisplayAwake", "Keep display awake", true),
  toggle("Startup", "SkipLogos", "Skip logos", true),
  toggle("Startup", "SkipLauncher", "Skip launcher", true),
  { ...range("FrameRate", "FpsLimit", "Frame rate limit", 0, -1, 1000), validation: "fps", description: "0 keeps the stock 60 fps cap; -1 follows the display. Use the clamp hotkey for sections that misbehave above 60 fps." },
  { id: "FrameRate/ClampHotkey", section: "FrameRate", key: "ClampHotkey", label: "60 fps clamp hotkey", category: "FrameRate", kind: "choice", defaultValue: "F9", options: ["", ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)], validation: "hotkey" },
  toggle("FrameRate", "FixMicrowaveMashing", "Correct microwave sequence timing", true),
  { ...range("Display", "MaxRenderWidth", "Crosshair safety width", 4095, 0, 16384), hidden: true },
  toggle("Advanced", "Log", "Write diagnostic log", true, true),
  { ...range("Advanced", "PatchTimeoutSeconds", "Patch timeout", 30, 5, 600), hidden: true },
];

// The 16,384 pixel limit is the hub's bounded input policy, not a hardware promise.

/* Configuration field definitions adapted from Universal Config Tool.
Copyright (c) 2025 Afevis. MIT License.
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
Sources: ShizCalev/MGSHDFix tag 4.1.1 and ShizCalev/MGSPatriotFix tag 0.2.1, ConfigTool/tab_data.cpp and src/resources/config_keys.hpp. */
const hdFields: PatchFieldSchema[] = [
  {"id":"FixAimingAfterEquip","section":"Bugfixes","key":"Fix Aiming After Equip","label":"Fix Aiming After Equip","category":"General","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"FixAimingFullTilt","section":"Bugfixes","key":"Fix Aiming On Full Tilt","label":"Fix Aiming On Full Tilt","category":"General","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"PauseOnFocusLoss_SpeedrunnerBugfixOverride","section":"Bugfixes","key":"Fix Alt-Tab Loading Bugs","label":"Fix Alt-Tab Loading Bugs","category":"General","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"DisableMouseCursor","section":"Bugfixes","key":"Fix Mouse Cursor Showing","label":"Fix Mouse Cursor Showing","category":"General","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_LaserOriginFix_FixM9FPV","section":"Bugfixes","key":"Fix M92 Laser Origin in FPV","label":"Fix M92 Laser Origin in FPV","category":"General","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"BusyLoopFix","section":"Bugfixes","key":"Fix  High  CPU  Usage","label":"Fix  High  CPU  Usage","category":"General","games":["mg12","mgs2","mgs3"],"kind":"choice","defaultValue":"Full","options":["Full","Half","Disabled"],"description":"(Also fixes TWD usage on handheld.)"},
  {"id":"ForceStereoAudio","section":"System Specific Fixes","key":"Audio Output Mode","label":"Audio Output Mode","category":"General","games":["mg12","mgs2","mgs3"],"kind":"choice","defaultValue":"Stereo (2.0)","options":["Stereo (2.0)","Surround Sound (5.1)"]},
  {"id":"CPUCoreLimit","section":"System Specific Fixes","key":"Limit Game to 2 CPU Cores","label":"Limit Game to 2 CPU Cores","category":"General","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false,"description":"(Fixes cutscene crashes on some newer CPUs)"},
  {"id":"ForceDedicatedGPU","section":"System Specific Fixes","key":"Force Dedicated GPU","label":"Force Dedicated GPU","category":"General","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true,"hidden":true},
  {"id":"DisableFullscreenOptimization","section":"System Specific Fixes","key":"Disable Windows Fullscreen Optimization","label":"Disable Windows Fullscreen Optimization","category":"General","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false,"hidden":true,"description":"(Fixes brief freezes when alt-tabbing on some systems.)"},
  {"id":"RenameOrRemoveCorruptSaveData","section":"Damaged Steam Cloud Save Data Fix","key":"Fix Mode","label":"Fix Mode","category":"General","games":["mg12","mgs2","mgs3"],"kind":"choice","defaultValue":"Move Outdated Save Data to Backup Folder","options":["Move Outdated Save Data to Backup Folder","Delete Outdated Save Data","Disable Damaged Save Data Fix"],"hidden":true},
  {"id":"CorruptSaveData_Notification","section":"Damaged Steam Cloud Save Data Fix","key":"Enable Console Notification When Fixed","label":"Enable Console Notification When Fixed","category":"General","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true,"hidden":true},
  {"id":"Region","section":"Language Settings","key":"Game Region","label":"Game Region","category":"General","games":["mg12","mgs2","mgs3"],"kind":"choice","defaultValue":"eu","options":["eu"],"hidden":true},
  {"id":"Language","section":"Language Settings","key":"Game Language","label":"Game Language","category":"General","games":["mg12","mgs2","mgs3"],"kind":"choice","defaultValue":"en","options":["en"],"hidden":true},
  {"id":"CtrlType","section":"Controller Settings","key":"Button Icons","label":"Button Icons","category":"General","games":["mg12","mgs2","mgs3"],"kind":"choice","defaultValue":"Keyboard / Mouse","options":["PlayStation 5","PlayStation 4","Xbox One","Nintendo Switch","Steam Deck","Keyboard / Mouse","PlayStation 2"]},
  {"id":"MenuButton","section":"Controller Settings","key":"Set Menu OK && Cancel Button","label":"Set Menu OK & Cancel Button","category":"General","games":["mgs2"],"kind":"choice","defaultValue":"Default","options":["Default","East for OK","South for OK"]},
  {"id":"PressureSensitiveFacebuttons","section":"Controller Settings","key":"Dualshock 2 && 3 Controller Support","label":"Dualshock 2 & 3 Controller Support","category":"General","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false,"description":"(Pressure Sensitive Buttons)\n(Experimental)"},
  {"id":"Ds3RumbleStrength","section":"Controller Settings","key":"DualShock Rumble Strength (%)","label":"DualShock Rumble Strength (%)","category":"General","games":["mgs2","mgs3"],"kind":"range","defaultValue":100,"min":0,"max":200,"step":1,"description":"(Windows Only)"},
  {"id":"SuppressAlternativeActions","section":"Controller Settings","key":"Restore PS2 Pressure Sensitive Binds","label":"Restore PS2 Pressure Sensitive Binds","category":"General","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"ForceWindowSize","section":"Window Settings","key":"Enable Resolution Overrides","label":"Enable Resolution Overrides","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"WindowWidth","section":"Window Settings","key":"Window Width","label":"Window Width","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"range","defaultValue":0,"min":0,"max":16384,"step":1},
  {"id":"WindowedMode","section":"Window Settings","key":"Fullscreen, Borderless, and Windowed","label":"Fullscreen, Borderless, and Windowed","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"choice","defaultValue":"Borderless Fullscreen","options":["Exclusive Fullscreen","Borderless Fullscreen","Borderless Windowed","Windowed (with borders)"]},
  {"id":"WindowHeight","section":"Window Settings","key":"Window Height","label":"Window Height","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"range","defaultValue":0,"min":0,"max":16384,"step":1},
  {"id":"RenderScaleWidth","section":"Internal Resolution / Render Scale (+ Downsampling / Supersampling / 21:9+ and 4:3 Support)","key":"Render Width","label":"Render Width","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"range","defaultValue":0,"min":0,"max":16384,"step":1},
  {"id":"RenderScaleHeight","section":"Internal Resolution / Render Scale (+ Downsampling / Supersampling / 21:9+ and 4:3 Support)","key":"Render Height","label":"Render Height","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"range","defaultValue":0,"min":0,"max":16384,"step":1},
  {"id":"ColorCorrection_Enabled","section":"Enhancements and Tweaks","key":"Correct Gamma Levels","label":"Correct Gamma Levels","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"AnisotropicFiltering","section":"Enhancements and Tweaks","key":"Anisotropic Filtering Level","label":"Anisotropic Filtering Level","category":"Graphics","games":["mgs2","mgs3"],"kind":"range","defaultValue":16,"min":0,"max":16,"step":1},
  {"id":"MG1_Crop_Overscan_Enabled","section":"Enhancements and Tweaks","key":"Crop Overscan Area","label":"Crop Overscan Area","category":"Graphics","games":["mg12"],"kind":"toggle","defaultValue":true},
  {"id":"MG1_Correct_Aspect_Ratio_Enabled","section":"Enhancements and Tweaks","key":"Correct Aspect Ratio to 4:3","label":"Correct Aspect Ratio to 4:3","category":"Graphics","games":["mg12"],"kind":"toggle","defaultValue":true},
  {"id":"EnableSMAA","section":"Enhancements and Tweaks","key":"Enable SMAA Anti-Aliasing","label":"Enable SMAA Anti-Aliasing","category":"Graphics","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"DisableTextureFiltering","section":"Enhancements and Tweaks","key":"Nearest Neighbor Texture Filtering","label":"Nearest Neighbor Texture Filtering","category":"Graphics","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_RestorePhotosensitiveEffects","section":"Enhancements and Tweaks","key":"Reduce Photosensitive Effects","label":"Reduce Photosensitive Effects","category":"Graphics","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"LOD_MGS2_NPC","section":"Model Quality && Level of Detail Enhancements","key":"Force High Quality Characters","label":"Force High Quality Characters","category":"Graphics","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"LOD_MGS2_ShellCasings","section":"Model Quality && Level of Detail Enhancements","key":"Always Show Weapon Shell Casings","label":"Always Show Weapon Shell Casings","category":"Graphics","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_Increase_Shadow_Resolution","section":"Model Quality && Level of Detail Enhancements","key":"Increase Shadow Resolution","label":"Increase Shadow Resolution","category":"Graphics","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_SoftParticles","section":"Model Quality && Level of Detail Enhancements","key":"Show Soft Particles","label":"Show Soft Particles","category":"Graphics","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_HeavyBandana","section":"Model Quality && Level of Detail Enhancements","key":"Make Snake's Bandana Heavier","label":"Make Snake's Bandana Heavier","category":"Graphics","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"DistanceCullingGrassAlways","section":"Model Quality && Level of Detail Enhancements","key":"Always Show Grass","label":"Always Show Grass","category":"Graphics","games":["mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"DistanceCullingGrassScalar","section":"Model Quality && Level of Detail Enhancements","key":"Custom Grass Distance Multiplier","label":"Custom Grass Distance Multiplier","category":"Graphics","games":["mgs3"],"kind":"range","defaultValue":1.0,"min":0,"max":10000,"step":0.05},
  {"id":"ToggleDistanceCullingGrass","section":"Model Quality && Level of Detail Enhancements","key":"Toggle Always Show Grass","label":"Toggle Always Show Grass","category":"Graphics","games":["mgs3"],"kind":"text","defaultValue":"Page Up","validation":"hdHotkey"},
  {"id":"FixAspectRatio","section":"Ultra-Wide / 16:10+","key":"Fix Aspect Ratio","label":"Fix Aspect Ratio","category":"Graphics","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"FixHUD","section":"Ultra-Wide / 16:10+","key":"Lock HUD && Movies to 16:9","label":"Lock HUD & Movies to 16:9","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"FixFOV","section":"Ultra-Wide / 16:10+","key":"Fix FOV","label":"Fix FOV","category":"Graphics","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"FramebufferFix","section":"Ultra-Wide / 16:10+","key":"Fix Framebuffer","label":"Fix Framebuffer","category":"Graphics","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true,"description":"(Fixes Pillarboxing issues)"},
  {"id":"SkipLauncher","section":"Launcher and Splashscreens","key":"Skip Launcher","label":"Skip Launcher","category":"Tweaks","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"SkipLauncherMSXGame","section":"Launcher and Splashscreens","key":"MSX Skip Launcher Game","label":"MSX Skip Launcher Game","category":"Tweaks","games":["mg12"],"kind":"choice","defaultValue":"Metal Gear (MSX)","options":["Metal Gear (MSX)","Metal Gear 2: Solid Snake"]},
  {"id":"LauncherJumpStart","section":"Launcher and Splashscreens","key":"Skip Launcher Splashscreens","label":"Skip Launcher Splashscreens","category":"Tweaks","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"SkipIntroLogos","section":"Launcher and Splashscreens","key":"Skip In-Game Splashscreens","label":"Skip In-Game Splashscreens","category":"Tweaks","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"EnablePauseOnFocusLoss","section":"Various","key":"Pause On Focus Loss","label":"Pause On Focus Loss","category":"Tweaks","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2BladeAnywhere","section":"Various","key":"High Frequency Blade Anywhere","label":"High Frequency Blade Anywhere","category":"Tweaks","games":["mgs2"],"kind":"toggle","defaultValue":false,"description":"(Experimental)"},
  {"id":"MGS2Sunglasses","section":"Various","key":"Force Sunglasses","label":"Force Sunglasses","category":"Tweaks","games":["mgs2"],"kind":"choice","defaultValue":"Normal","options":["Normal","Always","Never"]},
  {"id":"MGS2_SnakeTales_Radar","section":"Various","key":"Enable Radar in Snake Tales","label":"Enable Radar in Snake Tales","category":"Tweaks","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_FixDamageType","section":"Various","key":"Fix Vamp Punch Damage Type","label":"Fix Vamp Punch Damage Type","category":"Tweaks","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"PhotoCamera","section":"Various","key":"Camera Triggers Steam Screenshot","label":"Camera Triggers Steam Screenshot","category":"Tweaks","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_Lifebar_Name_Use_Custom","section":"Various","key":"Use Custom Lifebar Name","label":"Use Custom Lifebar Name","category":"Tweaks","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_Lifebar_Name_Use_Character_Names","section":"Various","key":"Use Character Names for Lifebar","label":"Use Character Names for Lifebar","category":"Tweaks","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_Lifebar_Name_Custom","section":"Various","key":"Custom Lifebar Name","label":"Custom Lifebar Name","category":"Tweaks","games":["mgs2"],"kind":"text","defaultValue":"LIFE"},
  {"id":"Disable_HDC_Camera_Positions","section":"Camera Positioning","key":"Disable HD Collection Camera Positioning","label":"Disable HD Collection Camera Positioning","category":"Tweaks","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"Disable_HDC_Camera_Positions_ToggleKey","section":"Camera Positioning","key":"HD Collection Camera Toggle","label":"HD Collection Camera Toggle","category":"Tweaks","games":["mgs2","mgs3"],"kind":"text","defaultValue":"F6","validation":"hdHotkey"},
  {"id":"Caption_Scale","section":"Caption Settings","key":"Caption Size (%)","label":"Caption Size (%)","category":"Tweaks","games":["mgs2","mgs3"],"kind":"range","defaultValue":100,"min":1,"max":100,"step":1},
  {"id":"Caption_Opacity","section":"Caption Settings","key":"Caption Opacity (%)","label":"Caption Opacity (%)","category":"Tweaks","games":["mgs2","mgs3"],"kind":"range","defaultValue":100,"min":0,"max":100,"step":1},
  {"id":"Caption_Background_Opacity","section":"Caption Settings","key":"Caption Outline Opacity (%)","label":"Caption Outline Opacity (%)","category":"Tweaks","games":["mgs2","mgs3"],"kind":"range","defaultValue":100,"min":0,"max":100,"step":1,"description":"30% Recommended"},
  {"id":"ShowSpeedrunnerOverlay","section":"Speedrunner Settings","key":"Gameplay Stats Overlay","label":"Gameplay Stats Overlay","category":"Tweaks","games":["mgs2","mgs3"],"kind":"choice","defaultValue":"Disabled","options":["Disabled","Top Left","Top Right","Bottom Left","Bottom Right"]},
  {"id":"ShowPressureLevels","section":"Speedrunner Settings","key":"Show Pressure Level Overlay","label":"Show Pressure Level Overlay","category":"Tweaks","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"FixIGTLoadingPause","section":"Speedrunner Settings","key":"Fix In-Game Timer Loading Pause","label":"Fix In-Game Timer Loading Pause","category":"Tweaks","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_RestoreElevatorGlitch","section":"Speedrunner Settings","key":"Restore SoL Elevator Glitch","label":"Restore SoL Elevator Glitch","category":"Tweaks","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_Hostage_Type","section":"Speedrunner Settings","key":"Force RTC Hostage Type","label":"Force RTC Hostage Type","category":"Tweaks","games":["mgs2"],"kind":"choice","defaultValue":"Normal","options":["Normal","Kato-chan","Old Beauties","Jennifer"]},
  {"id":"MGS2_Restore_VFX","section":"Bugfixes","key":"Fix Broken PS2 Visual Effects","label":"Fix Broken PS2 Visual Effects","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"MotionBlur","section":"Bugfixes","key":"Fix Motion Trails","label":"Fix Motion Trails","category":"Restoration","games":["mgs2"],"kind":"choice","defaultValue":"Full (Gameplay + Cutscenes)","options":["Full (Gameplay + Cutscenes)","Cutscenes Only","Disabled"]},
  {"id":"FixDepthOfField","section":"Bugfixes","key":"Fix Depth of Field","label":"Fix Depth of Field","category":"Restoration","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true,"description":"(Performance Heavy)"},
  {"id":"DepthOfFieldBlurUvMultiplier","section":"Bugfixes","key":"Depth of Field Blur Strength","label":"Depth of Field Blur Strength","category":"Restoration","games":["mgs2","mgs3"],"kind":"range","defaultValue":10.0,"min":0.0,"max":30.0,"step":0.05},
  {"id":"MGS3_Restore_Film_Grain","section":"Bugfixes","key":"Fix Film Grain","label":"Fix Film Grain","category":"Restoration","games":["mgs3"],"kind":"toggle","defaultValue":true,"description":"(Performance Heavy)"},
  {"id":"Restore_Reverb_Level","section":"Bugfixes","key":"Boost Reverb Volume","label":"Boost Reverb Volume","category":"Restoration","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"Restore_Reverb_Level_Scale","section":"Bugfixes","key":"Reverb Volume Multiplier","label":"Reverb Volume Multiplier","category":"Restoration","games":["mgs2","mgs3"],"kind":"range","defaultValue":1.4,"min":1,"max":100,"step":0.05,"description":"(1.40 Recommended)"},
  {"id":"MGS2_RestoreActionLevelSelection","section":"Various","key":"Restore Main Menu Voiceovers","label":"Restore Main Menu Voiceovers","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"RestoreDogtagNames","section":"Various","key":"Restore Original Dogtag Names","label":"Restore Original Dogtag Names","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_RestoreNodeDOBInfo","section":"Various","key":"Restore Node DoB && Bloodtype Entry","label":"Restore Node DoB & Bloodtype Entry","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_PhoneJingle","section":"Various","key":"Restore Japanese Phone Ringtone","label":"Restore Japanese Phone Ringtone","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"RestorePS2MemoryCardStrings","section":"Various","key":"Restore PS2 Memory Card Strings","label":"Restore PS2 Memory Card Strings","category":"Restoration","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"RestoreSoLRadarRotation","section":"Various","key":"Restore SoL Radar Rotation","label":"Restore SoL Radar Rotation","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_Thermal_Mode","section":"Various","key":"Thermal Goggle Palette Swapping","label":"Thermal Goggle Palette Swapping","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_Thermal_Cycle_Hotkey","section":"Various","key":"T.Goggle Color Cycle Hotkey","label":"T.Goggle Color Cycle Hotkey","category":"Restoration","games":["mgs2"],"kind":"text","defaultValue":"Num7","validation":"hdHotkey"},
  {"id":"MGS2_Thermal_Default_Mode","section":"Various","key":"Thermal Goggle Default Palette","label":"Thermal Goggle Default Palette","category":"Restoration","games":["mgs2"],"kind":"choice","defaultValue":"Substance","options":["Substance","Sons of Liberty","Splinter Cell","White Hot","Black Hot"]},
  {"id":"Restore_Title_Screen_Swapping","section":"MGS2 Community Bugfix Compilation Integration","key":"Restore Title Screen 2 Color Swapping","label":"Restore Title Screen 2 Color Swapping","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"UnusedRetroColonel","section":"MGS2 Community Bugfix Compilation Integration","key":"Retro MSX Colonel Sprite","label":"Retro MSX Colonel Sprite","category":"Restoration","games":["mgs2"],"kind":"choice","defaultValue":"Disabled","options":["Disabled","MSX2","Subsistence"]},
  {"id":"MGS2_RestoreOriginalDifficulty_EnableGrenadeCooking","section":"Difficulty Restoration","key":"Enable Grenade Cooking","label":"Enable Grenade Cooking","category":"Restoration","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_RestoreOriginalDifficulty_EnableGrenadeCooking_Toggle","section":"Difficulty Restoration","key":"Toggle Grenade Cooking","label":"Toggle Grenade Cooking","category":"Restoration","games":["mgs2"],"kind":"text","defaultValue":"Num9","validation":"hdHotkey"},
  {"id":"MGS2_RestoreOriginalDifficulty_Solidus_Choking","section":"Difficulty Restoration","key":"Restore PS2 Solidus Choking Difficulty","label":"Restore PS2 Solidus Choking Difficulty","category":"Restoration","games":["mgs2"],"kind":"choice","defaultValue":"Disabled","options":["Disabled","Duration Increase Only","Life Reduction Only","Full Restoration"]},
  {"id":"MGS2_First_Person_View_Hold_Button","section":"First Person Shooter Mode","key":"Tap to Keep First Person View Active","label":"Tap to Keep First Person View Active","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_First_Person_View_Hold_ToggleKey","section":"First Person Shooter Mode","key":"Toggle Tap for First Person View","label":"Toggle Tap for First Person View","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"Up","validation":"hdHotkey"},
  {"id":"MGS2_First_Person_View_Enabled","section":"First Person Shooter Mode","key":"Enable First Person Shooter Mode","label":"Enable First Person Shooter Mode","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"toggle","defaultValue":false,"description":"(EXPERIMENTAL - SEE TOOLTIP)\n(SOME EFFECTS WILL BE MISSING)\n(!!! MAY CAUSE CRASHING !!!)"},
  {"id":"MGS2_First_Person_View_ToggleKey","section":"First Person Shooter Mode","key":"Toggle First Person Shooter Mode","label":"Toggle First Person Shooter Mode","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"Right","validation":"hdHotkey"},
  {"id":"MGS2_First_Person_View_Movement_Enabled_By_Default","section":"First Person Shooter Mode","key":"First Person Shooter - Movement Enabled By Default","label":"First Person Shooter - Movement Enabled By Default","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"toggle","defaultValue":true},
  {"id":"MGS2_First_Person_View_Movement_ToggleKey","section":"First Person Shooter Mode","key":"Toggle First Person Shooter Movement","label":"Toggle First Person Shooter Movement","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"Down","validation":"hdHotkey"},
  {"id":"MGS2_First_Person_View_Sticky","section":"First Person Shooter Mode","key":"Keep First Person View Across Rooms","label":"Keep First Person View Across Rooms","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_ThirdPersonFreecam_Enabled","section":"Third Person Freecam","key":"Enable Third Person Freecam","label":"Enable Third Person Freecam","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"toggle","defaultValue":false,"description":"(EXPERIMENTAL - SEE TOOLTIP)\n(MOUSE SUPPORT STILL W.I.P.)\n(!!! MAY CAUSE CRASHING !!!)\n"},
  {"id":"MGS2_ThirdPersonFreecam_ToggleKey","section":"Third Person Freecam","key":"Third Person View Toggle","label":"Third Person View Toggle","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"Mouse5","validation":"hdHotkey","description":"(Controller inputs accepted)\n(Utilizes your Steam Input binds)"},
  {"id":"MGS2_ThirdPersonFreecam_Inherit_Camera_Rotation","section":"Third Person Freecam","key":"Inherit Camera Rotation","label":"Inherit Camera Rotation","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"MGS2_ThirdPersonFreecam_Inherit_Camera_Rotation_ToggleKey","section":"Third Person Freecam","key":"Inherit Camera Rotation Toggle","label":"Inherit Camera Rotation Toggle","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"NumMultiply","validation":"hdHotkey"},
  {"id":"MGS2_ThirdPersonFreecam_Horizontal_Sensitivity","section":"Third Person Freecam","key":"Horizontal Camera Sensitivity","label":"Horizontal Camera Sensitivity","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"range","defaultValue":0.6,"min":0.1,"max":10.0,"step":0.05},
  {"id":"MGS2_ThirdPersonFreecam_Max_Camera_Distance","section":"Third Person Freecam","key":"Max Camera Distance","label":"Max Camera Distance","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"range","defaultValue":4000,"min":100,"max":10000,"step":1},
  {"id":"MGS2_ThirdPersonFreecam_Vertical_Sensitivity","section":"Third Person Freecam","key":"Vertical Camera Sensitivity","label":"Vertical Camera Sensitivity","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"range","defaultValue":0.4,"min":0.1,"max":10.0,"step":0.05},
  {"id":"MGS2_ThirdPersonFreecam_Camera_Distance_Step_Amount","section":"Third Person Freecam","key":"Camera - Zoom Step Amount","label":"Camera - Zoom Step Amount","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"range","defaultValue":250,"min":1,"max":10000,"step":1},
  {"id":"MGS2_ThirdPersonFreecam_Camera_Distance_Decrease_Hotkey","section":"Third Person Freecam","key":"Camera - Zoom In Hotkey","label":"Camera - Zoom In Hotkey","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"WheelUp","validation":"hdHotkey"},
  {"id":"MGS2_ThirdPersonFreecam_Camera_Distance_Reset_Hotkey","section":"Third Person Freecam","key":"Camera - Zoom Reset Hotkey","label":"Camera - Zoom Reset Hotkey","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"Mouse4","validation":"hdHotkey"},
  {"id":"MGS2_ThirdPersonFreecam_Camera_Distance_Increase_Hotkey","section":"Third Person Freecam","key":"Camera - Zoom Out Hotkey","label":"Camera - Zoom Out Hotkey","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"text","defaultValue":"WheelDown","validation":"hdHotkey"},
  {"id":"MGS2_ThirdPersonFreecam_Camera_Distance_Change_Speed","section":"Third Person Freecam","key":"Camera - Zoom Speed","label":"Camera - Zoom Speed","category":"FPS Mode | 3rd Person","games":["mgs2"],"kind":"range","defaultValue":25,"min":1,"max":500,"step":1,"description":"(In microseconds)"},
  {"id":"CaptureInputsWhileAltTabbedHotkey","section":"Hotkeys","key":"Capture Hotkeys While Alt Tabbed","label":"Capture Hotkeys While Alt Tabbed","category":"Controls | Hotkeys","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"ToggleRainShader","section":"Hotkeys","key":"Toggle Vector Line Fixes","label":"Toggle Vector Line Fixes","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"text","defaultValue":"Insert","validation":"hdHotkey"},
  {"id":"CycleWireframeMode","section":"Hotkeys","key":"Cycle Wireframe Mode","label":"Cycle Wireframe Mode","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"text","defaultValue":"End","validation":"hdHotkey"},
  {"id":"DevMenuHotkey","hidden":true,"section":"Hotkeys","key":"Return to Developer Menu","label":"Return to Developer Menu","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"text","defaultValue":"F8","validation":"hdHotkey"},
  {"id":"OverrideMouseSensitivity","section":"Mouse Sensitivity","key":"Override Mouse Sensitivity","label":"Override Mouse Sensitivity","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false},
  {"id":"MouseSensitivity_XMultiplier","section":"Mouse Sensitivity","key":"X Multiplier","label":"X Multiplier","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"range","defaultValue":1,"min":1,"max":100,"step":1},
  {"id":"MouseSensitivity_YMultiplier","section":"Mouse Sensitivity","key":"Y Multiplier","label":"Y Multiplier","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"range","defaultValue":1,"min":1,"max":100,"step":1},
  {"id":"KeepAimingAfterFiring_InFirstPerson","section":"Keep Aiming After Firing","key":"While in First Person","label":"While in First Person","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true,"description":"(Excludes FPS mode)"},
  {"id":"KeepAimingAfterFiring_Always","section":"Keep Aiming After Firing","key":"Always Keep Aiming","label":"Always Keep Aiming","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false,"description":"(MGS2 support is limited to rifles.)\n    (All guns supported in MGS3.)"},
  {"id":"KeepAimingAfterFiring_InFPSMode","section":"Keep Aiming After Firing","key":"While in FPS Mode","label":"While in FPS Mode","category":"Controls | Hotkeys","games":["mgs2"],"kind":"toggle","defaultValue":false},
  {"id":"KeepAimingAfterFiring_OnLockOn","section":"Keep Aiming After Firing","key":"While Holding Lock On","label":"While Holding Lock On","category":"Controls | Hotkeys","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"AchievementPersistence","section":"Bugfixes","key":"Fix Achievement Stat Tracking","label":"Fix Achievement Stat Tracking","category":"Achievements","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":true,"hidden":true},
  {"id":"DisableSteamAchievements","section":"DISABLE STEAM ACHIEVEMENTS","key":"Disable Unlocking Steam Achievements","label":"Disable Unlocking Steam Achievements","category":"Achievements","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false,"hidden":true},
  {"id":"Safety Switch","section":"CAUTION - THIS WILL RESET ALL ACHIEVEMENTS","key":"Safety Switch","label":"Safety Switch","category":"Achievements","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false,"hidden":true},
  {"id":"ResetAllAchievements","section":"CAUTION - THIS WILL RESET ALL ACHIEVEMENTS","key":"Reset All Achievements","label":"Reset All Achievements","category":"Achievements","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false,"hidden":true},
  {"id":"CheckForUpdates","section":"Update Notifications","key":"Check For MGSHDFix Updates","label":"Check For MGSHDFix Updates","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"UpdateConsoleNotifications","section":"Update Notifications","key":"In-Game Update Notifications","label":"In-Game Update Notifications","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"MuteWarning","section":"Enable Game Warnings","key":"Warn When Game is Muted","label":"Warn When Game is Muted","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"FSRWarning","section":"Enable Game Warnings","key":"Warn When FSR Upscaling is Enabled","label":"Warn When FSR Upscaling is Enabled","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"MissingBugfixModWarning","section":"Enable Game Warnings","key":"Warn When Missing Major Bugfix Mods","label":"Warn When Missing Major Bugfix Mods","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"SaveFolderWriteWarning","section":"Enable Game Warnings","key":"Warn When Save Folders Not Writable","label":"Warn When Save Folders Not Writable","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"WindowsSlideshowWarning","section":"Enable Game Warnings","key":"Warn When Windows Slideshow Enabled","label":"Warn When Windows Slideshow Enabled","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"SaveFileReadOnlyWarning","section":"Enable Game Warnings","key":"Warn When Save Files Are Read-Only","label":"Warn When Save Files Are Read-Only","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":true},
  {"id":"VerboseLogging","section":"Debugging","key":"Debug Logging","label":"Debug Logging","category":"MGSHDFix / Internal","games":["mg12","mgs2","mgs3"],"kind":"toggle","defaultValue":false,"hidden":true},
  {"id":"Debugging_Start_In_Dev_Menu","section":"Debugging","key":"Start Game in Developer Menu","label":"Start Game in Developer Menu","category":"MGSHDFix / Internal","games":["mgs2","mgs3"],"kind":"toggle","defaultValue":false,"hidden":true},
];
const patriotFields: PatchFieldSchema[] = [
  {"id":"ForceDynamicResolutionOff","section":"Enhancements && Tweaks","key":"Disable Dynamic Resolution","label":"Disable Dynamic Resolution","category":"General","games":["mgs4"],"kind":"toggle","defaultValue":false},
  {"id":"DisableMotionBlur","section":"Enhancements && Tweaks","key":"Disable Motion Blur","label":"Disable Motion Blur","category":"General","games":["mgs4"],"kind":"toggle","defaultValue":false},
  {"id":"EnablePauseOnFocusLoss","section":"Enhancements && Tweaks","key":"Pause On Focus Loss","label":"Pause On Focus Loss","category":"General","games":["mgs4"],"kind":"toggle","defaultValue":false},
  {"id":"AnisotropicFiltering","section":"Enhancements && Tweaks","key":"Anisotropic Filtering Level","label":"Anisotropic Filtering Level","category":"General","games":["mgs4"],"kind":"range","defaultValue":16,"min":1,"max":16,"step":1},
  {"id":"ShadowBufferSize","section":"Enhancements && Tweaks","key":"Custom Shadow Resolution","label":"Custom Shadow Resolution","category":"General","games":["mgs4"],"kind":"choice","defaultValue":"0","options":["0","512","1024","2048","4096"],"description":"(0 = Use Vanilla Game Setting)"},
  {"id":"DisableFullscreenOptimization","section":"System Specific Fixes","key":"Disable Windows Fullscreen Optimization","label":"Disable Windows Fullscreen Optimization","category":"General","games":["mgs4","mgspw"],"kind":"toggle","defaultValue":false,"hidden":true,"description":"(Fixes brief freezes when alt-tabbing on some systems.)"},
  {"id":"SkipLauncher","section":"Launcher and Splashscreens","key":"Skip Launcher","label":"Skip Launcher","category":"General","games":["mgs4","mgspw"],"kind":"toggle","defaultValue":false},
  {"id":"LauncherSkip","section":"Launcher and Splashscreens","key":"Skip Launcher Splashscreens","label":"Skip Launcher Splashscreens","category":"General","games":["mgs4"],"kind":"choice","defaultValue":"Disabled","options":["Disabled","Game Start","Main Menu"]},
  {"id":"LauncherSkip","section":"Launcher and Splashscreens","key":"Skip Launcher Splashscreens (PW)","label":"Skip Launcher Splashscreens (PW)","category":"General","games":["mgspw"],"kind":"choice","defaultValue":"Disabled","options":["Disabled","Game Start"]},
  {"id":"SkipSplashscreens","section":"Launcher and Splashscreens","key":"Skip In-Game Splashscreens","label":"Skip In-Game Splashscreens","category":"General","games":["mgs4"],"kind":"toggle","defaultValue":false},
  {"id":"GameResolution_PW","section":"Launcher and Splashscreens","key":"Internal Resolution (PW)","label":"Internal Resolution (PW)","category":"General","games":["mgspw"],"kind":"choice","defaultValue":"Original","options":["Original","FHD"]},
  {"id":"GameUpscale_PW","section":"Launcher and Splashscreens","key":"Internal Upscaling (PW)","label":"Internal Upscaling (PW)","category":"General","games":["mgspw"],"kind":"choice","defaultValue":"Original","options":["Original","FHD","WQHD","4K"]},
  {"id":"GameMovie_PW","section":"Launcher and Splashscreens","key":"Cutscenes (PW)","label":"Cutscenes (PW)","category":"General","games":["mgspw"],"kind":"choice","defaultValue":"Original","options":["Original","High-Resolution"]},
  {"id":"Region","section":"Language Settings","key":"Game Region","label":"Game Region","category":"General","games":["mgs4","mgspw"],"kind":"choice","defaultValue":"eu","options":["eu"],"hidden":true},
  {"id":"Language","section":"Language Settings","key":"Game Language","label":"Game Language","category":"General","games":["mgs4","mgspw"],"kind":"choice","defaultValue":"en","options":["en"],"hidden":true},
  {"id":"CtrlType","section":"Controller Settings","key":"Button Icons","label":"Button Icons","category":"General","games":["mgs4"],"kind":"choice","defaultValue":"AUTO","options":["AUTO","Xbox","PlayStation 4","PlayStation 5","Nintendo Switch"]},
  {"id":"CtrlType","section":"Controller Settings","key":"Button Icons (PW)","label":"Button Icons (PW)","category":"General","games":["mgspw"],"kind":"choice","defaultValue":"Keyboard","options":["Keyboard","Xbox","PlayStation 4","PlayStation 5","Nintendo Switch"]},
  {"id":"Ds3Support","section":"Controller Settings","key":"Enable DualShock 3 Support","label":"Enable DualShock 3 Support","category":"General","games":["mgs4"],"kind":"toggle","defaultValue":false,"description":"(Pressure Sensitive Buttons)"},
  {"id":"MouseRawInput","section":"Mouse Settings","key":"Use Raw Mouse Input","label":"Use Raw Mouse Input","category":"Controls / Mouse Input","games":["mgs4"],"kind":"toggle","defaultValue":false,"description":"(Disables Mouse Acceleration)"},
  {"id":"MouseSensitivityX","section":"Mouse Settings","key":"Mouse Horizontal Sensitivity","label":"Mouse Horizontal Sensitivity","category":"Controls / Mouse Input","games":["mgs4"],"kind":"range","defaultValue":1.0,"min":0.05,"max":10.0,"step":0.05},
  {"id":"MouseSensitivityY","section":"Mouse Settings","key":"Mouse Vertical Sensitivity","label":"Mouse Vertical Sensitivity","category":"Controls / Mouse Input","games":["mgs4"],"kind":"range","defaultValue":1.0,"min":0.05,"max":10.0,"step":0.05},
  {"id":"CheckForUpdates","section":"Update Notifications","key":"Check For MGSPatriotFix Updates","label":"Check For MGSPatriotFix Updates","category":"MGSPatriotFix / Internal","games":["mgs4","mgspw"],"kind":"toggle","defaultValue":true},
  {"id":"UpdateConsoleNotifications","section":"Update Notifications","key":"In-Game Update Notifications","label":"In-Game Update Notifications","category":"MGSPatriotFix / Internal","games":["mgs4","mgspw"],"kind":"toggle","defaultValue":true},
  {"id":"VerboseLogging","section":"Debugging","key":"Debug Logging","label":"Debug Logging","category":"MGSPatriotFix / Internal","games":["mgs4","mgspw"],"kind":"toggle","defaultValue":false,"hidden":true},
  {"id":"LogCreateResults","section":"Debugging","key":"Log Create Results","label":"Log Create Results","category":"MGSPatriotFix / Internal","games":["mgs4"],"kind":"toggle","defaultValue":false,"hidden":true},
  {"id":"LogFrameBuffers","section":"Debugging","key":"Log Framebuffers","label":"Log Framebuffers","category":"MGSPatriotFix / Internal","games":["mgs4"],"kind":"toggle","defaultValue":false,"hidden":true},
  {"id":"MSAALogTargets","section":"Debugging","key":"MSAA Log Targets","label":"MSAA Log Targets","category":"MGSPatriotFix / Internal","games":["mgs4"],"kind":"toggle","defaultValue":false,"hidden":true},
];

export const patchSchemas: Record<string, PatchSchema> = {
  mgsm2fix: { id: "mgsm2fix", title: "MGSM2Fix", versions: ["3.7.2"], fields: m2Fields, format: "ini", message: "Widescreen requires the native Fullscreen screen mode. Custom internal resolution requires High or Max mode." },
  mgshdfix: { id: "mgshdfix", title: "MGSHDFix", versions: ["4.1.1"], fields: hdFields, format: "settings", message: "When resolution overrides are enabled, leave native Internal Resolution and Internal Upscaling at Default / Original. Language and registry options remain in the original Config Tool." },
  mgspatriotfix: { id: "mgspatriotfix", title: "MGSPatriotFix", versions: ["0.2.1"], fields: patriotFields, format: "settings", message: "Launcher skipping uses this fix's language and button icons. Windows compatibility options are in its Config Tool." },
  sunnysideup: { id: "sunnysideup", title: "Sunny Side Up", versions: ["1.0.6"], fields: sunnyFields, format: "numericIni", message: "Dynamic resolution and startup skips overlap with PatriotFix. Preserve one owner for each setting." },
  "mgs2-community": { id: "mgs2-community", title: "MGS2 Community Bugfix Compilation", versions: ["3.0.0"], format: "ini", fields: [toggle("Update Notifications", "Check For MGS2 Commmunity Bugfix Updates", "Check for compilation updates", true)] },
  "mgs3-community": { id: "mgs3-community", title: "MGS3 Community Bugfix Compilation", versions: ["2.0.1"], format: "ini", fields: [toggle("Update Notifications", "Check For MGS3 Commmunity Bugfix Updates", "Check for compilation updates", true)] },
};

// Accepted names from HD 4.1.1 src/resources/input_handler.cpp, ParseVirtualKey.
const hdKeyNames = new Set((
  "ADD ALT APOSTROPHE APPS ASTERISK BACKSLASH BACKSPACE BKSP BREAK CAPS CAPSLOCK COMMA CONTROLLERA CONTROLLERB CONTROLLERX " +
  "CONTROLLERY CTRL DECIMAL DEL DELETE DIVIDE DOT DOWN END ENTER ESC ESCAPE GAMEPADA GAMEPADB GAMEPADX " +
  "GAMEPADY GRAVE HOME INS INSERT LALT LBRACKET LCTRL LEFT LSHIFT LWIN MENU MINUS MULTIPLY PADA " +
  "PADB PADBACK PADDOWN PADDPADDOWN PADDPADLEFT PADDPADRIGHT PADDPADUP PADDUP PADL1 PADL2 PADLB PADLDOWN PADLEFT PADLEFTBUMPER PADLEFTSTICK " +
  "PADLEFTSTICKDOWN PADLEFTSTICKLEFT PADLEFTSTICKRIGHT PADLEFTSTICKUP PADLEFTTRIGGER PADLLEFT PADLRIGHT PADLS PADLSTICK PADLT PADLUP PADMENU PADR1 PADR2 PADRB " +
  "PADRDOWN PADRIGHT PADRIGHTBUMPER PADRIGHTSTICK PADRIGHTSTICKDOWN PADRIGHTSTICKLEFT PADRIGHTSTICKRIGHT PADRIGHTSTICKUP PADRIGHTTRIGGER PADRLEFT PADRRIGHT PADRS PADRSTICK PADRT PADRUP " +
  "PADSELECT PADSTART PADVIEW PADX PADY PAGEDOWN PAGEUP PAUSE PERIOD PGDN PGUP PLUS PRINTSCREEN PRTSC PRTSCR " +
  "QUOTE RALT RBRACKET RCTRL RETURN RIGHT RSHIFT RWIN SCROLL SCROLLLOCK SEMICOLON SHIFT SLASH SPACE SPACEBAR " +
  "STAR SUBTRACT TAB TILDE UP WIN "
).trim().split(" "));
export function isHdHotkey(value: string): boolean {
  let key = value.trim().toUpperCase().replace(/[ _-]/g, "");
  if (/^0X[0-9A-F]{1,4}$/.test(key)) return Number.parseInt(key.slice(2), 16) <= 0xff || ["0X1000", "0X1001"].includes(key);
  if (key.startsWith("VK")) key = key.slice(2);
  if (/^[A-Z0-9]$/.test(key) || /^(?:F(?:[1-9]|1[0-9]|2[0-4])|MOUSE[1-5]|(?:M|MOUSE)?WHEEL(?:UP|DOWN))$/.test(key)) return true;
  key = key.replace(/^(?:KP|KEYPAD|NP|NUM(?!PAD))/, "NUMPAD");
  if (/^NUMPAD(?:[0-9]|MULTIPLY|MUL|STAR|ASTERISK|DIVIDE|DIV|SLASH|FORWARDSLASH|FSLASH|PLUS|ADD|MINUS|SUBTRACT|SUB|DASH|HYPHEN|DOT|DECIMAL|PERIOD|POINT|ENTER|RETURN|[*/+.])$/.test(key)) return true;
  return key === "*" || hdKeyNames.has(key);
}

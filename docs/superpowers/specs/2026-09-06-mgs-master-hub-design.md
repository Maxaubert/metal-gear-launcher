# MGS Master Hub, design

Date: 2026-09-06. Status: proposed.

## 1. What it is

A fullscreen launcher for the Metal Gear Solid Master Collection (Vol.1 and Vol.2) on Windows
that looks like the collection's own per-game menu screens, but covers every game in one app.
Each game gets a screen in the original layout and its own colour scheme (MGS1 red, MGS2 blue,
MGS3 green, MGS4 grey and orange, Peace Walker olive, MG1/MG2 amber), with the real Yoji Shinkawa
key art, logos, fonts and menu music pulled from the user's own Steam install at first run.

Public project: GitHub repo with installer and releases, usable by any Master Collection owner.
No Konami assets ship in the download.

## 2. Scope

Four features, delivered as four plans (one PR each), in this order:

| Phase | Feature | Delivered by |
|---|---|---|
| 1 (MVP) | Game hub: per-game screens, Game Selection, Start Game, art extraction, controller + keyboard + mouse, installer, Start menu, Playnite entry | plan `2026-09-06-mvp-hub.md` |
| 2 | Settings per game: Konami launcher options plus fix-mod INIs (MGSHDFix, MGSM2Fix, MGSPatriotFix, Sunny Side Up, Community Bugfix) | later plan |
| 3 | Bonus content: Master Book, Screenplay Book rendered in-app from the extracted page images; MGS4 Database and Bonus Content apps as launch entries | later plan |
| 4 | Comics: PDF reader in the same style, one folder per game | later plan |

Games covered: MGS1 (M2), MGS2, MGS3, MG1/MG2 (Unity launchers, Vol.1), MGS4, Peace Walker
(Unity launchers, Vol.2). Bonus Content apps (Vol.1 and Vol.2, M2) appear in phase 3.

Out of scope: in-game options (they live inside save files), mod installation, save management,
non-Steam installs (GOG does not sell the collection), non-Windows.

## 3. Requirements

- **Look.** Layout per screen matches the originals: vertical logo strip on the left, main
  visual centre-left, right column with the big year label, subtitle, description, and the menu
  list. Dotted-line background. Menu music per game. Transitions between games and menus.
  Large text and strong contrast (the owner has low vision and runs a 4K TV at 225 %).
- **Input.** Full controller navigation (D-pad/left stick, A confirm, B back, LB/RB or
  left/right for previous/next game, Start for Game Selection), keyboard (arrows, Enter, Esc,
  PageUp/PageDown), mouse. Focus is always visible. Never soft-locks: every screen has a way back.
- **Launch.** Starts the game executable directly, bypassing Konami's launcher, with the Steam
  overlay and achievements working (`SteamAppId` environment variable set for the process).
  Falls back to `steam://rungameid/<id>` when the direct launch is refused. Hub minimises while
  the game runs and returns to the front when the game exits.
- **Art extraction.** First run finds the Steam library (`libraryfolders.vdf`), locates each
  installed game, extracts the assets it needs into `%LOCALAPPDATA%\MGSMasterHub\assets\<game>\`,
  and shows progress. Games not installed show a greyed screen with an "Install on Steam" entry.
  Re-extraction is available from the settings menu and runs when a game's build id changes.
- **Entry points.** Start menu shortcut from the installer; `--game <id>` command line argument
  opens directly on a game; documented Playnite setup (one hub entry, optional per-game entries
  using `--game`).
- **Settings (phase 2).** Editable from inside the hub with the same navigation; values written
  back to the exact file the game or mod reads; a mod that is not installed does not show.
- **Books (phase 3).** Page viewer over the extracted page images with bookmarks, zoom, and
  the original book-flip feel; MGS4 Database and Bonus Content apps launch externally.
- **Comics (phase 4).** `comics\<gameId>\*.pdf` under the app data folder (or a folder the
  user picks); pdf.js viewer with controller paging; unmatched PDFs on a shared shelf.

## 4. Architecture

Electron + React + TypeScript, built with electron-vite, packaged with electron-builder (NSIS),
same toolchain as AudioDeck. Three processes:

- **Main** (`electron/main/`): window management, Steam library discovery, game packs, the
  extraction pipeline, launching, settings files, IPC handlers. Node only.
- **Preload** (`electron/preload/`): a typed `window.hub` bridge, nothing else.
- **Renderer** (`src/`): React screens. No Node access. Reads art via `hub-asset://` protocol
  that serves files from the asset cache.

### 4.1 Game packs (data-driven screens)

One React screen component renders every game from a pack. Packs live in `shared/packs/*.json`
and are validated with zod at startup. A pack declares:

```jsonc
{
  "id": "mgs3",
  "title": "METAL GEAR SOLID 3: SNAKE EATER",
  "number": "3",
  "yearLabel": "1964",
  "subtitle": "Operation Snake Eater",
  "description": "In 1964 ...",
  "theme": { "accent": "#3f8a2f", "ink": "#101410", "paper": "#f4f4ee" },
  "steam": { "appId": 2131650, "installDir": "MGS3" },
  "launch": { "exe": "METAL GEAR SOLID3.exe", "cwd": ".", "env": { "SteamAppId": "2131650" } },
  "assets": [
    { "role": "mainVisual", "source": "unity", "path": "launcher_Data/StreamingAssets/aa/StandaloneWindows64/packedassetsmgs3_assets_launcher/prefabs/mgs3/animator.prefab.bundle", "name": "mgs3_mainvisual" },
    { "role": "logo", "source": "unity", "path": "...animator.prefab.bundle", "name": "mgs3_logo" },
    { "role": "numbering", "source": "unity", "path": "...animator.prefab.bundle", "name": "mgs3_numbering" },
    { "role": "year", "source": "unity", "path": "...animator.prefab.bundle", "name": "mgs3_year_number" },
    { "role": "bgEffect", "source": "unity", "path": "...animator.prefab.bundle", "name": "mgs3_bg_effect" },
    { "role": "bgm", "source": "unity", "path": ".../bgm/mgs3/mg35_mgs3_menu_lp.wav.bundle", "name": "MG35_mgs3_menu_lp" },
    { "role": "font-medium", "source": "unity", "path": "launcher_Data/sharedassets0.assets", "name": "MG-RodinProN-M" }
  ],
  "menu": ["start", "gameSelection", "quit"]
}
```

MGS1 uses `"source": "m2"` entries that name a file inside `windata/alldata.bin` (for example
`system/motion/outgame_menu_main.psb.m`) plus a sprite rectangle in the decoded atlas.

Adding a game is a JSON file plus a colour theme. The renderer never special-cases a game.

### 4.2 Extraction pipeline

Two bundled MIT tools under `resources/tools/`, downloaded by `scripts/fetch-tools.ps1` at build
time and shipped as extraResources:

- **AssetStudioModCLI** (self-contained .NET build) for Unity bundles and asset files: exports
  Texture2D as PNG, Font as TTF, AudioClip as WAV, filtered by name.
- **FreeMote PsbDecompile** for the M2 archives: decompiles the `alldata.psb.m` manifest to JSON
  (seed `25G/xpvTbsb+6`, length 64), then decompiles single `.psb.m` files to PNG or JSON.

`Extractor` (main process) runs per game: resolve install dir, for each asset entry call the
matching tool into a temp folder, copy the wanted file to
`assets\<gameId>\<role>.<ext>`, write `assets\<gameId>\manifest.json` with the Steam build id
and tool versions. For M2 the manifest is decoded once, the needed files are sliced out of
`alldata.bin` by offset and length (no 11 GB unpack), and sprite rectangles are cropped from the
atlas with sharp. Progress and errors go to the renderer over IPC; a failed asset leaves a
placeholder and a visible "assets incomplete" marker, never a crash.

### 4.3 Launching

`Launcher.start(pack)` spawns the exe detached with `cwd` and `env` from the pack, tracks the pid,
minimises the hub, and polls until the process tree exits, then restores the window. If spawn
fails or the process exits within 3 seconds with a non-zero code, it opens
`steam://rungameid/<appId>` instead and reports which path was used. A game that requires its
Konami launcher (nothing known today) can set `"launch": { "steam": true }`.

### 4.4 Input

One `useNavigation` hook in the renderer maps Gamepad API, keyboard and mouse into the same
actions (`up`, `down`, `left`, `right`, `confirm`, `back`, `prevGame`, `nextGame`, `menu`).
Focus is a single piece of state per screen. Gamepad polling at 60 Hz with repeat and
dead-zone handling; the hub also listens for the Guide button to bring itself to the front.

### 4.5 Settings files (phase 2, recorded here so the packs are shaped for it)

| Game | Konami launcher options | Fix mods |
|---|---|---|
| MGS2, MGS3, MG1/MG2 | `<game>_savedata_win\<SteamId>\launcher\launcher_sv` JSON (keyList/valueList: language, HiresoPreset, HiresoRender, HiresoUpScale, HiresoMovie) | `plugins\MGSHDFix.ini`, `plugins\<game>-Community-Bugfix-Compilation.ini` |
| MGS1 | inside M2 (not editable) | `MGSM2Fix.ini` next to the exe |
| MGS4 | `mgs4_savedata_win\<SteamId>\launcher\launcher_sv` JSON (resolution, WindowMode, language); `MGS4\config\mgs4.user.ini` render overrides | `MGS4\scripts\SunnySideUp.ini`, `MGSPatriotFix.settings` |
| Peace Walker | same shape as MGS4 | `MGSPatriotFix.settings` |

Each option is declared in the pack as `{ key, label, type, values | range, file, section }`
and rendered by one generic settings screen. Files are written atomically with a `.bak` copy.

### 4.6 Storage

`%LOCALAPPDATA%\MGSMasterHub\`: `assets\`, `config.json` (Steam path override, volume, last game,
comics folder), `logs\hub.log` (electron-log, rotated). No telemetry, no network calls except
the update check against GitHub Releases.

## 4.7 Visual layout (normalized across every game)

Reference screenshots (owner-supplied, not committed): `.superpowers/sdd/2026-09-06-mvp-hub/reference/ref-8.png`
(Vol.1 Bonus Content menu), `ref-9.png` (MGS3 menu), `ref-10.png` (MGS1 menu), `ref-11.png` (HD Collection
MGS3 title, a looser layout, for the "art floats into the background" feel), `ref-12.png` (MGS2 menu),
`ref-13.png` (MGS1 Game Selection list, dark variant).

Every game screen uses the same geometry. Units are percentages of viewport width (W) and height (H) so
1080p and 2160p look identical. The window is true fullscreen (`BrowserWindow.fullscreen`), never maximized.

**Ground.** Paper colour from the pack with a halftone dot pattern (radial-gradient dots, spacing 0.55 vh,
ink at 10 % alpha). No boxes, no panels: artwork sits directly on the paper and fades into it.

**Left zone (0 to 61 % W).**
- Logo strip: the vertical logo texture at x = 0, height 100 % H, top aligned, `object-fit: contain`,
  natural width (about 10 % W). Games without a vertical logo texture (MG1/MG2) render the title as
  rotated Rodin bold text in the same slot, same height.
- Main visual: bottom anchored (bottom 0), height 94 % H, horizontally centred between 11 % W and 61 % W,
  `object-fit: contain`. Textures that are not pre-cut (rectangular launcher backgrounds for MGS4 and
  Peace Walker, the MGS1 atlas crop) get a soft edge: `mask-image` with a radial gradient (opaque to
  70 %, transparent at 100 %) plus a linear fade on the top 12 %. Pack flag `edge: "fade" | "cut"`
  per asset, default `cut`.
- Background effect: the bgEffect texture at 18 % opacity, width 58 % W, top left at (2 % W, 2 % H),
  behind the main visual and the logo strip.
- Nothing in the left zone is interactive.

**Divider.** 1 px vertical rule at x = 61.5 % W, full height, ink at 25 % alpha.

**Right column (63 % W to 97.5 % W).**
- Ghosts (behind everything, non-interactive): the timeline texture (`year` role) at 15 % opacity,
  height 100 % H, left aligned at 63 % W; the ghost number (`numbering` role) at 14 % opacity, height
  46 % H, right aligned at 97.5 % W, top 3 % H.
- Header block, top 7 % H:
  - a 0.35 vw wide, 2.5 vh tall ink tick at 63 % W followed by a 1 px rule 2 vw long (the bracket),
  - the year: `pack.yearLabel` in Rodin bold, 8 vh tall, tight letter spacing, ink colour,
  - the subtitle under it: `pack.subtitle` split on ` / ` into one or two lines, Rodin bold 2.2 vh,
    letter-spacing 0.02 em, ink at 85 %,
  - on the far right of the same block: an accent "!" glyph (Rodin bold, 6 vh) with a decorative
    barcode built from 24 alternating 1 to 3 px ink bars, and `[ 00N ]` (N = pack position) in a
    2 vh monospace line under it,
  - a 1 px rule under the block from 63 % W to 97.5 % W, ink at 45 %.
- Description: top 29 % H, Rodin regular 2.35 vh, line-height 1.5, ink at 85 %, max 8 lines, no scroll.
- Menu list: bottom anchored so the last row ends at 91 % H; rows 5.6 vh tall with 1.1 vh gaps; each row
  is a 1 px ink border on paper at 70 % alpha, text Rodin regular 2.9 vh, padding-left 1.4 vw; the
  focused row is filled with the accent colour, white text, and a 0.45 vw accent bar 0.6 vw to the
  left of the row (outside the box); the quit row is uppercase "QUIT GAME". MVP rows: "Start Game",
  "Game Selection", "QUIT GAME". Rows greyed (ink 35 %) when the game is not installed.
- Footer hints: bottom right, baseline at 96 % H, 2.1 vh: a filled circle glyph with the button letter
  (L, A, B) then the label ("Move cursor", "Confirm", "Back"); mouse and keyboard users see
  "Arrows", "Enter", "Esc" instead when the last input was not a gamepad.

**Game Selection (dark variant).** Full-screen overlay: the current screen stays underneath dimmed to 25 %
brightness; the right column turns into a list of banner tiles, one per game, 34 % W by 8.5 % H, 1 vh gap,
vertically centred. Each banner shows the game's main visual as a blurred, darkened cover
(`object-fit: cover`, brightness 45 %) with the title in Rodin bold 2.6 vh white on top, and the pack
number in the accent colour. Focused banner: accent left bar and full brightness. Left zone shows the
focused game's logo strip and portrait at 60 % brightness with a small info block bottom left:
title, "Originally released in <first year>" (new pack field `releaseYear`), 2.1 vh. Transition 200 ms.

**Transitions.** Game change: crossfade 250 ms of the whole left zone and the ghosts; the right column
text fades 150 ms. Menu focus change: the accent bar slides (120 ms). Music crossfades 300 ms.

**Bonus content (phase 3 note).** The Bonus Content screen (ref-8) is a montage of vertical panels, one
per game's key art, with a gold logo strip; the phase 3 plan builds it from the same asset roles.

## 5. Error handling

- Steam not found: screen with a folder picker for the Steam root, retry.
- Game not installed: greyed screen, "Install on Steam" opens `steam://install/<appId>`.
- Tool missing or failing: extraction marks the asset failed, logs the command line and
  stderr, shows a per-game "assets incomplete" badge with a "Retry extraction" entry.
- Launch failure: dialog with the exact error, offers the Steam fallback.
- Every IPC handler validates input with zod and returns `{ ok, error? }`; the renderer never
  throws on a failed call.

## 6. Testing

- **Unit (vitest):** pack schema, Steam library parsing (`libraryfolders.vdf`, `appmanifest`),
  M2 manifest JSON to file table, asset manifest staleness, navigation reducer, launcher
  fallback decision (with a fake spawn).
- **Integration (vitest, opt-in, this machine only):** run the real tools on the real install and
  assert the expected files appear; skipped when the games are absent.
- **E2E (Playwright, Electron):** boots the app with a fixture asset cache (small PNGs and a
  silent WAV committed under `e2e/fixtures/`), navigates with keyboard events between games,
  opens Game Selection, confirms Start Game calls a mocked launcher.
- **Visual check:** Playwright screenshots of every game screen at 3840x2160 stored as
  artifacts for review, not as a gate.
- CI (`ci.yml`): typecheck, lint, unit on PR and push to main. `release.yml` builds the NSIS
  installer and publishes `v<version>`.

## 7. Legal

The app contains no Konami material. Extraction runs on the user's machine against files they
own, output stays in their profile, and the README says so. Bundled tools: AssetStudioMod
(MIT), FreeMote (MIT), their licences shipped in `resources/tools/`.

## 8. Naming

Repo `mgs-master-hub`, product name "MGS Master Hub", installer `MGSMasterHub-Setup-x64-<version>.exe`.

## 9. Phase 4 input: the owner's library

4.8 GB. Not only comics: Comic Books (cbr, MGS 2004-2005 #01-12, Sons of Liberty 2005-2007 #00-12),
Original Master Books (pdf per game incl. MG/MG2), Original Screenplays (pdf, plus Night Mode variants),
Scenario Books (pdf, MGS1-4, PW), Manuals (pdf), Novels (pdf), Guides (pdf), Artbooks (pdf/cbz/cbr + 495
loose jpg/png), Wallpaper Dump (mostly low-res), Information.docx (source links).
Implications for the phase 4 plan: reader must handle pdf, cbz (zip) and cbr (rar: bundle unrar or 7z),
a per-game "Library" menu with sections (Comics, Books, Manuals, Guides, Art) rather than a single
"Comics" entry, and file-to-game mapping by filename keywords with a manual override file.

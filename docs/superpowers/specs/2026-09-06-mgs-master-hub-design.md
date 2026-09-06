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

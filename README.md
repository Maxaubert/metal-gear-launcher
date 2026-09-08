# Metal Gear Launcher

A fullscreen launcher for the Metal Gear Solid Master Collection, styled after the collection's
own in-game menus. It extracts each game's own menu art and music from its install, shows one
screen per game, and launches the title from there, with a gamepad, keyboard or mouse.

## Screenshots

No real game art ships in this repository or in any screenshot here (see **Legal** below): the
hub's own end-to-end tests render the same layout against hand-made placeholder art instead of
extracted Konami assets. Run `npm run e2e` and check `e2e/out/*.png` for that placeholder
preview, or install the hub for the real thing.

## Requirements

- Windows 10 or 11, x64
- Steam, with MGS Master Collection Vol.1 and/or Vol.2 installed (the hub works with either
  volume alone; games it can't find in Steam show a "not installed" tile instead of failing)
- A gamepad is recommended but not required; keyboard and mouse both work

## Install

Download the installer from the
[latest release](https://github.com/Maxaubert/metal-gear-launcher/releases/latest)
(`MetalGearLauncher-Setup-x64-<version>.exe`) and run it. The launcher checks GitHub Releases once at
boot and shows a footer prompt when a newer version is out.

Previously named MGS Master Hub. Upgrades retain your settings, music and extracted artwork in
the existing `%LOCALAPPDATA%\MGSMasterHub\` data folder.

## First run and extraction

On first launch (or after Steam updates a game), the hub asks for your Steam library folder if
it can't find it automatically, then extracts each installed game's menu art and music into its
own folder under `%LOCALAPPDATA%\MGSMasterHub\assets\<game>\`. Extraction never writes anywhere
else, and never touches your game install. Files are cached and re-extraction is skipped unless
a game updates or the bundled extraction tools change.

## Controls

The hub opens on the last game you successfully launched. Browsing other game tabs does not
change this preference; `--game` still overrides it for a particular launch.

| Input | Action |
|---|---|
| Left stick / D-pad, arrow keys | Move focus |
| A, Enter / Space, or click | Confirm |
| B, Escape / Backspace | Back, or open the quit prompt from the hub |
| Start, Tab | Open game selection |
| Y, R key | Retry a failed extraction (shown only when a game's art is missing) |
| Y, Y key (when shown) | Open the release page for an available update |

Moving the mouse over a menu item highlights it without activating it. Keyboard and gamepad
navigation take over when you use them. Change games through **Game Selection**; arrows and
shoulder buttons do not switch games from the main menu.

## Trophies

Open **Trophies** from a game's main menu to browse each achievement, its description,
your unlock state, and the percentage of players who earned it. Steam data loads directly
from Steam, with local stats and cached snapshots available when offline. No API key is needed.
Private or unavailable unlock states are labeled explicitly.

Matching GOG achievements appear as another source when GOG Galaxy has cached them locally.
Open Galaxy to update its cache. An edition must support Galaxy achievements to provide that
list; other storefronts are not connected yet. These trophy sources do not change the hub's
Steam-based game installation and launch support. See [platform details](docs/achievements.md).

## Menu music

Open **Options > Menu Music > Open Music Folder** for a game's local music library. Add FLAC,
MP3, WAV, OGG or M4A files, then choose **Refresh Music**. Tracks appear under their filenames
without extensions. The folders are `%LOCALAPPDATA%\MGSMasterHub\music\<game-id>\`.

Moving through the song list previews each track immediately. Confirm a song to save it
automatically. Leaving the list restores the last confirmed theme.
Renaming or removing a selected file makes the hub fall back to an available default.
The opening menu waits for its music to start before appearing.

Options save changes automatically. Rapid edits are serialized, and leaving a settings page
waits for pending writes. If a game or another app changes the same settings file, the hub keeps
your pending edit and offers recovery instead of overwriting the external change. Keyboard
hints use keycaps; controller hints retain controller buttons.

When present, these filenames provide the initial defaults. An explicit saved choice takes
priority; absent files fall back to the extracted original menu theme.

| Game folder | Default filename |
| --- | --- |
| `mg12` | `Zanzibar Breeze (Opening BGM 2).flac` |
| `mgs1` | `Introduction.flac` |
| `mgs2` | `Metal Gear Solid Main Theme.flac` |
| `mgs3` | `Snake Eater.flac` |
| `mgs4` | `Old Snake (Title).flac` |
| `mgspw` | `Heavens Divide.flac` |

Music files stay on your PC and are not included with the installer.

Menu effects are also local. Place WAV files named `navigate`, `select`, `back`, `options`,
`adjust` and `start` in `%LOCALAPPDATA%\MGSMasterHub\sounds\` (with the `.wav` extension).
They play across all game menus and settings, using the hub's saved volume. Quiet recordings
are raised to a consistent peak level before playback, with capped gain and headroom. The hub decodes
them before showing the menus; missing or invalid files leave that action silent.
`vr.wav` is reserved for a future VR Missions entry.

To import the supplied 30-second labeled MGS sound reference, install FFmpeg and run:

```powershell
pwsh -File scripts/import-menu-sounds.ps1 -Source 'C:\path\mgs-menu-sounds(audio only).mp4'
```

This importer uses the reference's labeled timestamps. Other recordings need their own cuts.
The original Master Collection launcher effects differ from this reference, so they are not
silently substituted. Restart the hub after replacing effect files.

## `--game` flag

Launch straight into one game, skipping the hub's own selection screen:

```
"Metal Gear Launcher.exe" --game mgs3
```

Valid ids: `mg12`, `mgs1`, `mgs2`, `mgs3`, `mgs4`, `mgspw`. If the hub is already running, a
second launch with `--game` switches the running window to that game instead of opening a
second copy. This is what per-game Playnite entries use; see below.

## Playnite

See [`docs/playnite.md`](docs/playnite.md) for adding the hub as a single Playnite tile (or one
tile per game via `--game`), and for hiding the Master Collection's several separate Steam
entries so they don't clutter your library alongside it.

## Legal

No Metal Gear Solid / Konami assets are ever committed to this repository or bundled with the
installer. The hub only reads menu art and music out of your own legitimately purchased Steam
install, at runtime, on your own machine. The two extraction tools it bundles
(AssetStudioModCLI, FreeMote) are MIT-licensed and unaffiliated with Konami; their licenses ship
alongside them under `resources/tools/LICENSES/`.

## Roadmap

- Per-game settings screen (Konami launcher options and community fix-mod settings), see
  `docs/superpowers/specs/2026-09-06-mgs-master-hub-design.md` section 4.5
- In-hub book/comic viewer for the Master Book, Screenplay Book and MGS4 Database content
- More launch options (borderless, monitor selection) surfaced from the hub itself

## Development

```bash
npm install
npm run dev
```

`npm run dev` opens fullscreen by default; set `HUB_WINDOWED=1` to run windowed during
development.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run the app in development with hot reload |
| `npm run build` | Build the Electron app |
| `npm run typecheck` | Type-check main, preload and renderer |
| `npm run lint` | Lint the codebase |
| `npm run test` | Run the unit test suite (Vitest) |
| `npm run e2e` | Build and run end-to-end tests (Playwright) |
| `npm run fetch-tools` | Download the two MIT extraction tools (first `dist` on a machine) |
| `npm run dist` | Build and package a Windows installer |

Windows x64, Node 24, npm 11.

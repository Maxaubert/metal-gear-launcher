<div align="center">
  <img src="resources/icon.png" alt="Metal Gear Launcher" width="128">

  # Metal Gear Launcher

  Your Metal Gear collection. One place to return to.

  A fullscreen hub for Master Collection Vol.1 and Vol.2.

  [![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011%20x64-b91c1c?style=flat-square)](#requirements)
  [![Latest release](https://img.shields.io/github/v/release/Maxaubert/metal-gear-launcher?style=flat-square&color=b91c1c)](https://github.com/Maxaubert/metal-gear-launcher/releases/latest)
  [![CI](https://img.shields.io/github/actions/workflow/status/Maxaubert/metal-gear-launcher/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/Maxaubert/metal-gear-launcher/actions/workflows/ci.yml)

  [Download](https://github.com/Maxaubert/metal-gear-launcher/releases/latest) · [Install](#install) · [Documentation](#documentation) · [Report an issue](https://github.com/Maxaubert/metal-gear-launcher/issues)
</div>

---

https://github.com/user-attachments/assets/0970022a-ffdd-4828-96a0-49b630cde6e8

Move between Metal Gear games in menus styled after the Master Collection, with a gamepad,
keyboard or mouse. Launch a game, adjust its settings, or explore your soundtracks, films and
books from the same hub.

The walkthrough shows the actual launcher using media from locally installed games.
The installer does not bundle game soundtrack albums, books or videos; available content is
read or extracted from your own installations.

## Features

- **One collection, one launcher.** Metal Gear & Metal Gear 2, MGS1, MGS2, MGS3, MGS4 and
  Peace Walker, with individual menus and animated game selection. Missing games are clearly marked.
- **Settings where you need them.** Change supported game options and detected community-fix
  settings from each game's Options menu. Changes save automatically.
- **Your menu soundtrack.** Preview and choose locally available tracks, or add your own music.
  Loudness normalization keeps themes at a more consistent level between games.
- **Both volumes of Bonus Content together.** Play installed Digital Graphic Novels and
  soundtracks, or browse Master Books and Screenplay Books in a fullscreen reader.
- **A home for personal books.** Add PDF, CBZ and CBR files, zoom and pan, hide the controls,
  and return to your last page. Personal imports also work without games installed.
- **Trophies at a glance.** Browse achievement descriptions, your available unlock states and
  global completion percentages, with Steam and locally cached GOG Galaxy data.

## Requirements

- Windows 10 or 11, x64
- Steam and the Master Collection games you want to launch. Either volume and partial
  installations work; missing games show as "not installed" instead of failing
- A gamepad is recommended but not required; keyboard and mouse both work

## Install

1. Download `MetalGearLauncher-Setup-x64-<version>.exe` from the
   [latest release](https://github.com/Maxaubert/metal-gear-launcher/releases/latest).
   If you downloaded a ZIP, extract the installer first.
2. Run the installer and use its default folder. This is a standalone application, so it
   does not need to go inside a game folder or a mod manager.
3. Open Metal Gear Launcher and let first-run preparation finish. It detects your Steam
   libraries and prepares the content available in your installed games.

Release builds are currently unsigned, so Windows may show an unrecognized-app warning.
The launcher checks GitHub Releases once at boot and shows a footer prompt when a newer version is out.

Previously named MGS Master Hub. Upgrades retain your settings, music and extracted artwork in
the existing `%LOCALAPPDATA%\MGSMasterHub\` data folder.

## First run and extraction

On first launch (or after Steam updates a game), the hub asks for your Steam library folder if
it can't find it automatically, then prepares the available artwork, books and music. Media
that needs extraction is cached under `%LOCALAPPDATA%\MGSMasterHub\`; supported soundtrack and
movie files play directly from their installations. Extraction writes only to the hub's data
and temporary folders, and never changes your game install. Cached files are reused unless a
game updates or the bundled extraction tools change.

## Controls

The hub opens on the last game you successfully launched, or MGS3 on a fresh installation.
Browsing other game tabs does not change this preference; `--game` still overrides it for a
particular launch.

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

## Bonus Content

Choose **Game Selection > Bonus Content** for one combined library of Vol.1 and Vol.2 extras.
**Videos** plays installed Vol.1 Digital Graphic Novels with chapter selection.
**Digital Soundtrack** combines the tracks available in your installed bonus-content apps.

Steam library locations are detected automatically. Install the relevant Bonus Content app and
its optional movie downloads through Steam first. Missing volumes or individual media files do
not prevent the rest of the library from working. Retry refreshes detection after an installation.
The first startup prepares installed content behind a progress screen before opening menus.
Completed files are reused after interruption; failures offer Retry. New or changed installations
are prepared on the next startup. Small menu and sleeve images use the local cache; movies and tracks
play directly from the Steam library without being copied. No bonus media ships with the launcher.
Bonus Content has its own artwork and transition in Game Selection. Its menus play a sequential
playlist of classic themes and vocal finales found in your local game music folders, including
Snake Eater, The Best Is Yet to Come, Old Snake and Heavens Divide. Unavailable songs are skipped.
The vocal selections follow [Konami's series compilation](https://www.konami.com/mg/mgs5/tpp/jp/goods/item_vtac.html).
The playlist combines your local classics with available tracks from installed games and bonus soundtracks.
The playlist pauses for soundtrack playback and movies, then resumes from the same position.

To replace the playlist, add audio files to `%LOCALAPPDATA%\MGSMasterHub\music\bonus\` and restart
the launcher. Files play in filename order (numeric prefixes are supported), with extensions
hidden from titles. The last song returns to the first; individual songs do not loop.

Master Books and Screenplay Books appear under **Bonus Content → Books** for installed games.
Choose English or Japanese, browse the contents, zoom and pan, and resume your last page.
Pages fill the window, with controls overlaid and hidden when idle. Startup prepares all available
book pages in the local cache so opening books later does not require extraction. No book content
is bundled. You can also choose **Add Books** or **Add Folder** to import personal PDF, CBZ and CBR books without copying or converting the originals. Imported books work without Steam games installed. **Refresh** rechecks file availability, and **Remove from Library** removes only the library entry. See [book support](docs/books.md).

## Menu music

The launcher detects soundtracks in your Steam libraries. Bonus Content music plays directly
from its installed files. MG2 opening themes and the MGS2 opening main theme are decoded once
into the launcher's `native-music` cache. Game files are never changed. These are the in-game
edits, which can differ in length from album releases. MGS1, MGS3, MGS4 and Peace Walker currently
use the corresponding installed Bonus Content soundtrack. Missing games or optional tracks are skipped.

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

When available, these titles provide the initial defaults from installed content or personal files.
An explicit saved choice takes priority. Personal files match the title in any supported format.
If absent, another available track is used; a game with no available music stays silent.
Original launcher menu themes are not restored.

| Game folder | Default filename |
| --- | --- |
| `mg12` | `Zanzibar Breeze (Opening BGM 2).flac` |
| `mgs1` | `Introduction.flac` |
| `mgs2` | `Metal Gear Solid Main Theme.flac` |
| `mgs3` | `Snake Eater.flac` |
| `mgs4` | `Old Snake (Title).flac` |
| `mgspw` | `Heavens Divide.flac` |

There is one installer, with no bundled music pack. Personal files stay on your PC and are
never included in a build. See [local music and packaging](docs/menu-music-pack.md) for optional
FLAC conversion and release details.

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

This is an unofficial fan-made launcher, unaffiliated with Konami. Metal Gear and the original
game media belong to their respective rights holders. The product demonstration shows the
launcher running with media from local installations; it is not a bundle of those game assets.
Game artwork, books and bonus media are read or extracted locally, while personal books are
imported from local files. Installers contain no soundtrack music or personal books.

AssetStudioModCLI and FreeMote provide extraction support. FreeMote, by Ulysses Wu, is licensed
under **CC BY-NC-SA 4.0**, with additional component notices in its
[included license](resources/tools/LICENSES/FreeMote.LICENSE.txt). Third-party components retain
their own licenses; see the notices included with each tool.
The pinned [vgmstream r2117](https://github.com/vgmstream/vgmstream/releases/tag/r2117) runtime
decodes local game audio. Its copyright notice ships alongside the executable, with codec
library notices and source links in `resources/tools/vgmstream/LICENSES/`.
These tools are unaffiliated with Konami.

The personal comic reader includes 7-Zip. Its LGPL/BSD and unRAR restriction notices ship beside
the executable. See [7-Zip licensing](https://www.7-zip.org/license.txt) and
[corresponding source](https://github.com/ip7z/7zip/tree/26.03).

## Roadmap

- MGS4 Database content and additional manuals
- More launch options (borderless, monitor selection) surfaced from the hub itself

## Documentation

| Guide | Covers |
| --- | --- |
| [Books](docs/books.md) | Installed books, personal imports and reader controls |
| [Menu music](docs/menu-music-pack.md) | Local music files, conversion and packaging |
| [Achievements](docs/achievements.md) | Steam and GOG sources, account data and limitations |
| [Playnite](docs/playnite.md) | One launcher tile or a separate entry for each game |

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
| `npm run fetch-tools` | Download extraction tools and the pinned vgmstream audio decoder |
| `npm run dist` | Build and package a Windows installer |

Windows x64, Node 24, npm 11.

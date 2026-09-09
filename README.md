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
(`MetalGearLauncher-Setup-x64-<version>.exe`) and run it. The installer contains no soundtrack files;
music is obtained from your local game installations or your own files. The launcher checks GitHub Releases once at
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

No Metal Gear Solid / Konami media is committed to this repository. Game artwork, books and bonus
media are read from local installations, while personal books are imported from local files.
Installers contain no soundtrack music or personal books. AssetStudioModCLI and FreeMote are
MIT-licensed extraction tools; their licenses ship under `resources/tools/LICENSES/`.
The pinned [vgmstream r2117](https://github.com/vgmstream/vgmstream/releases/tag/r2117) runtime
decodes local game audio. Its copyright notice ships alongside the executable, with codec
library notices and source links in `resources/tools/vgmstream/LICENSES/`.
These tools are unaffiliated with Konami.

The personal comic reader includes 7-Zip. Its LGPL/BSD and unRAR restriction notices ship beside
the executable. See [7-Zip licensing](https://www.7-zip.org/license.txt) and
[corresponding source](https://github.com/ip7z/7zip/tree/26.03).

## Roadmap

- Per-game settings screen (Konami launcher options and community fix-mod settings), see
  `docs/superpowers/specs/2026-09-06-mgs-master-hub-design.md` section 4.5
- MGS4 Database content and additional manuals
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
| `npm run fetch-tools` | Download extraction tools and the pinned vgmstream audio decoder |
| `npm run dist` | Build and package a Windows installer |

Windows x64, Node 24, npm 11.

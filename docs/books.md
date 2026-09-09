# Native books

**Bonus Content → Books** reads Master Books and Screenplay Books from installed Steam games.
English and Japanese are supported. Books are not bundled with the launcher and the original
game files are never changed. Missing games simply contribute no books to the library.

| Game | Master spreads per language | Screenplay pages EN / JP |
|---|---:|---:|
| Metal Gear / Metal Gear 2 | 10 | 71 / 52 |
| MGS1 | 45 | 273 / 203 |
| MGS2 | 50 | 420 / 295 |
| MGS3 | 66 | 465 / 341 |
| MGS4 | 56 | 309 / 219 |
| Peace Walker | 44 | 442 / 305 |

These counts were verified against the installed collection on 2026-09-08. A Master spread
can contain more than one printed page. Neither book format is a native PDF.

## Loading and storage

On first startup, the launcher searches the user's Steam libraries and prepares all available
book metadata and referenced images before opening its menus. A non-dismissible progress screen
shows the current work. Preparation also includes game menus and bonus artwork; videos and audio
that already play directly from Steam are not duplicated. Completed extraction caches survive
interruption, and a failed item offers Retry rather than exposing an unfinished library.

Completion is recorded only after verification. Later startups check source/build/tool identity
and cached file sizes/timestamps, without decoding images again. Missing or changed files and new
installations trigger preparation of the remaining content. Reading positions do not invalidate
the completion record. The full collection can require several gigabytes of local image cache.

Decoded files live under `%LOCALAPPDATA%\MGSMasterHub\book-cache`. Source installation,
build, source file size/modification time and decoder content identify cache entries. Cached files
are validated, incomplete output is discarded, and corrupt entries are rebuilt. Concurrent
requests for the same entry share one extraction. Warm pages need no decoder process.
Decoder EXE and VERSION files use content digests, so installer timestamp changes do not
invalidate prepared content. Moving from the older timestamp identities requires one
preparation pass; subsequent reinstalls reuse the cache when tool contents are unchanged.

While reading, the launcher preloads and decodes nearby pages with at most two active reads.
The retained page window has a 128 MiB image budget; the displayed page and in-flight decoding
can add to that. A cached turn updates immediately. For a distant jump, the previous page stays
visible until the requested page is ready, and newer navigation takes priority over queued
preloads. Closing a book cancels its image work. Only successfully displayed pages are saved.
Parsed native metadata and validated hashes are also reused in bounded memory caches, with
file identity checks preserving repair when the installed source or cached output changes.

Reading positions are saved separately for each game, book and language after the page has
loaded successfully. The reader offers a contents list, direct page entry, Previous/Next,
zoom, Fit and pointer panning. Pages occupy the full window. Floating controls fade after 2.5
seconds idle and return on input; hover, focus, contents and errors keep them visible without
resizing the page. Keyboard and controller hints follow the active input method.
Use Hide or H to keep the compact controls hidden while reading. H or the small Controls button restores them; pointer movement and page turns do not cancel manual hiding.
An extraction failure has a retry action and does not replace the last successful position.

## Native formats

- MGS1 uses the M2 archive and FreeMote. The reader follows the actual page tables and uses
  lowercase archive basenames for MDF seeds, rather than unused legacy filename lists.
- Other games use Unity Addressables. AssetStudio extracts metadata and Sprite artwork,
  with Texture2D fallback for covers where needed. Peace Walker worldwide overrides are used.
- Master Books display original spread images at their native resolution.
- Screenplays combine native rich text, stage directions, dialogue and artwork. A restricted
  React renderer supports the native formatting tags; content is never executed as HTML.
  Text reflows for readability and zoom, so screenplay typography is not a pixel-identical
  rendering of the original game engine.
- Sparse artwork changes, explicit empty backgrounds and left/right page layers are retained.
  The MGS4 `johhny` reference resolves to its `johnny` artwork without modifying source data.

Native verification covered all 24 language/book combinations, covers, interior pages, saved
positions and warm cache reuse. Automated fixtures cover missing installations, alternate
libraries, cache corruption, retry, navigation, language selection and safe text rendering.

The MGS4 Database is a separate Unreal IoStore application and is not included in this reader.
Other regional manuals have not been fully inventoried. Previously extracted research files
under the separate `books` directory are not required by the application.

## Clean local installation checks

After packaging, run `pwsh -File scripts/install-clean.ps1` for local first-run testing.
It archives `%LOCALAPPDATA%\MGSMasterHub` and `%APPDATA%\MGS Master Hub` under
`%LOCALAPPDATA%\MetalGearLauncher-install-backups`, then installs without existing settings,
reading history, extracted files, imported music or Chromium state. The archived files remain
available for recovery. Steam installations, game settings and saves are untouched.
The next launch discovers and prepares the installed library as it would for a new user.
This is a local testing helper; normal release installers continue to preserve user data.

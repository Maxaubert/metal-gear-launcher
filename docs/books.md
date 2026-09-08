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

At startup, the launcher searches the user's Steam libraries and checks for the book archives.
It does not decode book metadata or images. Opening a book prepares its metadata and requested
page. Subsequent page turns extract only the required images. Shared artwork is reused.

Decoded files live under `%LOCALAPPDATA%\MGSMasterHub\book-cache`. Source installation,
build, file size, modification time and decoder version identify cache entries. Cached files
are validated, incomplete output is discarded, and corrupt entries are rebuilt. Concurrent
requests for the same entry share one extraction. Warm pages need no decoder process.

Reading positions are saved separately for each game, book and language after the page has
loaded successfully. The reader offers a contents list, direct page entry, Previous/Next,
zoom, Fit and pointer panning. Keyboard and controller hints follow the active input method.
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

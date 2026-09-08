# Native book findings

Verified against the installed Steam Master Collection games on 2026-09-08. All six game
packages contain English and Japanese Master Books and Screenplay Books. None are native PDFs.
This was a local extraction investigation; automatic book discovery/extraction and a reader
are not implemented in the launcher yet.

| Game | Master spreads per language | Screenplay text records EN / JP | Screenplay artwork images |
|---|---:|---:|---:|
| MGS1 | 45 | 273 / 203 | 62 |
| MGS2 | 50 | 420 / 295 | 112 |
| MGS3 | 66 | 465 / 341 | 85 |
| MGS4 | 56 | 309 / 219 | 139 |
| Peace Walker | 44 | 442 / 305 | 65 |
| Metal Gear / Metal Gear 2 | 10 | 71 / 52 | 25 |

The local extraction under `%LOCALAPPDATA%\MGSMasterHub\books\` contains 542 Master spread
images, 488 screenplay artwork images and 3,395 screenplay text records. All 1,030 PNGs were
fully decoded to verify them. A spread texture may contain multiple printed pages. Native
resolution is preserved, including 1080p interiors and 4K covers where supplied.

The root `manifest.json` links twelve per-book manifests with native page order, language,
bookmarks/index data, artwork references and rendering status. Original decoded metadata is
preserved. No game installation was changed and no book content is committed or bundled.

Master spreads can be displayed directly. Screenplays combine rich text with sparse background
changes and multiple text areas; faithful story pages need a renderer and comparison with the
native reader. Extracted artwork alone is not a complete screenplay page.

## Extraction details for future reader work

- MGS1 uses the M2 archive. MDF seeds require a lowercase basename while retaining the native
  filename. Verify actual output because the decoder can exit successfully without files.
- Other games store book metadata and Sprite/Texture2D artwork in Unity Addressables bundles.
  MGS3 has two screenplay covers requiring Texture2D fallback. Peace Walker includes worldwide
  overrides and Sprite naming variants; source-bundle mappings resolve them.
- Preserve native empty-background markers such as MGS1's `null_pic`. MGS4 English page 32
  contains `johhny`; the local manifest records an inferred alias to `johnny` without modifying
  the source data. That page still needs comparison with the native reader.
- Use actual page tables, not unused legacy filename lists. Keep extraction on demand in the
  launcher data cache, resolve libraries dynamically, and invalidate against source/tool changes.

The installed MGS4 Database is a separate Unreal IoStore application. Its extraction was not
implemented by this investigation. Regional manuals and other reader assets have not been
fully inventoried.

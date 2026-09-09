# Optional menu music at build time

The launcher accepts personal FLAC, MP3, WAV, OGG and M4A files in each game's
Menu Music folder. The displayed title is the filename without its extension.

For a local installer containing music, prepare MP3 playback copies:

```powershell
pwsh -NoProfile -File scripts/prepare-menu-music.ps1 -Source 'C:\path\to\mgs-hub-music' -FfmpegPath 'C:\path\to\ffmpeg.exe'
npm run dist
```

The source uses the folders `MG`, `MGS`, `MGS2`, `MGS3`, `MGS4`, and `MGSPW`.
Conversion uses MP3 at 256 kbps and preserves the original FLACs. Existing prepared
files are skipped. The ignored output under `resources/menu-music` is included by
electron-builder. A checkout containing only `.gitkeep` builds successfully without
music; CI does not download a private music collection.

`scripts/package-launcher.mjs` labels the installer explicitly as
`MetalGearLauncher-Full-Setup-x64-<version>.exe` when prepared MP3s are present,
or `MetalGearLauncher-Lite-Setup-x64-<version>.exe` when absent. Run with
`--dry-run` to check the edition without packaging. Full includes the supplied
music pack; books are still optional local imports in both editions.

For reproducible Full releases, publish an approved music ZIP as a separate
GitHub release asset, with `mg12`, `mgs1`, `mgs2`, `mgs3`, `mgs4`, and `mgspw`
folders at its root. Set repository Actions variables `MENU_MUSIC_PACK_URL` to
that asset's HTTPS download URL and `MENU_MUSIC_PACK_SHA256` to its SHA256.
Release CI downloads and verifies the pack before building Full. A missing pair
produces an explicitly labelled Lite build. When configured, the release provides both Lite and Full installers; incomplete configuration or an invalid
pack fails the release. No media is uploaded by the preparation scripts.

On startup the pack fills missing tracks in the user's writable music folders.
Files with the same title in another supported format are preserved and do not
receive a duplicate MP3. Explicit user selections remain intact; a selection also
follows a same-named track after converting its extension. The default titles work
in all supported formats. The pack never reintroduces the extracted original menu
themes removed from the launcher.

Media is not tracked in Git. Include only music you have permission to redistribute
when producing a public installer. Local full builds and public builds can use the
same code and differ only in which optional resource files are supplied.

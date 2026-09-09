# Local music and packaging

Music comes from the user's installed games and personal files. No soundtrack
files are bundled with the launcher, downloaded during release builds, or copied
from the developer's music library into an installer.

Installed Bonus Content M4A tracks play directly from the Steam library. The MG2
opening themes and MGS2 opening main theme use a bundled open-source decoder,
vgmstream, to create WAV playback copies under the launcher's `native-music` cache.
Only tracks found in the user's installation are decoded. Cache entries include
the source and decoder identities and are rebuilt after those change.
MGS1, MGS3, MGS4 and Peace Walker use their installed Bonus Content soundtracks.
Optional tracks that are not installed are omitted. Personal music remains supported.

`npm run dist` produces `MetalGearLauncher-Setup-x64-<version>.exe`.
`node scripts/package-launcher.mjs --dry-run` reports the artifact name without
packaging. Full and Lite editions are retired. Existing private files under
`resources/menu-music` are ignored by packaging and can remain untouched.

GitHub Releases publishes only the current version's exact installer filename.
The old `MENU_MUSIC_PACK_URL` and `MENU_MUSIC_PACK_SHA256` repository variables
are no longer read. The local clean-install helper also requires the new filename
so a stale Full installer cannot be chosen accidentally.

## Personal music

The launcher accepts FLAC, MP3, WAV, OGG and M4A files in each game's Menu Music
folder. The displayed title is the filename without its extension. Use Options >
Menu Music > Open Music Folder to find the writable folder on your PC.

Conversion is optional. To create smaller MP3 playback copies for personal use,
choose an explicit output folder separate from the original collection:

```powershell
pwsh -NoProfile -File scripts/prepare-menu-music.ps1 -Source 'C:\path\to\mgs-hub-music' -Output 'C:\path\to\personal-music-copies' -FfmpegPath 'C:\path\to\ffmpeg.exe'
```

The source uses folders `MG`, `MGS`, `MGS2`, `MGS3`, `MGS4` and `MGSPW`.
Output folders use `mg12`, `mgs1`, `mgs2`, `mgs3`, `mgs4` and `mgspw`.
Conversion uses MP3 at 256 kbps, preserves original FLACs, and skips existing
prepared files. Copy the desired output into your Menu Music folders and refresh
the list. This utility does not change the installer or upload media.

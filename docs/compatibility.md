# Installation compatibility

The hub discovers each game independently through Steam's application manifests. Community
fixes are optional. An absent game remains selectable and shows its installation action;
an installed game without extracted artwork opens preparation before its menus appear.

Steam discovery uses a configured folder, the current user's registry entry, and standard
installation folders. The root Steam library is included alongside additional libraries.
Both current and legacy library lists are supported, including a fresh Steam installation
that has not written its library list yet. When discovery finds no Steam installation,
initial preparation offers the Steam folder picker.

Paths come from discovered manifests and Windows user directories. Spaces and Unicode are
preserved through discovery, process checks, native settings lookup, and game launching.
MGS1's Steam userdata is looked up in the configured Steam installation, even when its game
files live in another library. Hub settings and extracted artwork live in the current user's
local application data directory; a development/test data override stays isolated.

## Verification

Automated tests create disposable Steam libraries and data directories on Windows. They cover:

| Scenario | Expected behavior |
| --- | --- |
| One game installed, no community fixes | Native settings and game launch remain available |
| Secondary library with spaces and Unicode | The manifest's actual installation path is used |
| No games installed | All six missing-game pages remain navigable |
| No Steam installation discovered | Preparation exposes the folder picker |
| Installed game without cached artwork | Preparation appears instead of incomplete menus |
| Legacy, missing, or empty library lists | Discovery includes the root Steam library |
| MGS1 game files and userdata in different locations | Native settings use the configured Steam userdata root |
| Missing or corrupt cached assets | Startup offers retry and artwork re-extraction |
| No native save files or multiple Steam accounts | Hub Menu Music remains separate from account-dependent native settings |
| Concurrent per-game music and navigation preferences | Config updates preserve unrelated selections |

Extraction tools are bundled in the installer. AssetStudio uses its official .NET Framework
build, verified against an original font export byte for byte and an original sprite export.
Users do not need the .NET 9 runtime. The tools require .NET Framework 4.8, available in modern
Windows 10 and Windows 11. Original game launchers must have created their settings files
before all native settings can be edited. No community patch is required.

These checks exercise installation variations on this Windows machine; they are not tests on
separate physical PCs. Driver behavior, individual game prerequisites, and unusual display
configurations still depend on the target computer. Multiple-display ordering remains unverified.

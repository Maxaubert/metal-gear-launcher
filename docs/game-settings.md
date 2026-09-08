# Per-game settings

Options opens a game's native-style settings categories using the same extracted artwork,
fonts, palette and controller navigation as its main menu. Community Fixes lists detected
patches separately, with their version and configuration status.

Startup prepares installed games' settings, decodes menu artwork, and loads native fonts before
showing the launcher. Main, Game Selection and Options share a persistent background, so menu
navigation does not remount the portrait or restart its fade. MGS1 uses extracted static lettering
and its original English bitmap font; the other games share their identical extracted font files.

Main launcher buttons share the native Unity menu style across all six games, including MGS1:
700 by 60 pixels with a 70-pixel row pitch and 32-pixel labels on a 1920 by 1080 canvas.
Each game retains its reference highlight color. These dimensions scale
with the viewport instead of growing MGS1's rows to fill unused space.

The single-game pages share a common year-header and menu anchor when switching games.
MG/MG2 retains its separate two-chapter composition.

Menu Music selects the hub background theme independently for each game. Its catalog currently
contains only that game's Original Menu Theme, backed by the existing extracted audio.
Selections use stable catalog IDs in hub configuration, never game save files or absolute paths.
Save and Discard on this page leave pending native settings untouched. The category remains
available when native settings are uninitialized or an account has not been selected.
See [installation compatibility](compatibility.md) for the tested installation scenarios.

Options opens from the prepared settings snapshot. Reload and Discard explicitly reread the
files, and saving still checks for external changes before writing. Failed startup preparation
offers Retry and artwork re-extraction with keyboard, mouse and controller navigation. Cached
artwork for uninstalled games cannot block startup.

| Work | Verification |
| --- | --- |
| Match native Options and category screens | Captured native references and independent visual critique |
| Read native launcher settings for the installed Steam account | Verified formats, field mappings and synthetic codec tests |
| Detect and configure supported installed fixes | Installed signatures and versioned upstream schemas |
| Save pending changes | Validation, conflict detection, original-file backups, atomic replacement and reread |
| Keyboard, mouse and controller navigation | Playwright at HD and 4K |

Opening Options never changes game configuration. Edits remain pending until Save Changes.
MG/MG2 Screen settings show the original wallpaper and display-area preview, including
pending changes. Its preview assets are extracted from the installed game into the hub cache.
Leaving with pending changes offers Keep Editing or Discard and Leave. Multiple Steam
accounts require an explicit account choice. The renderer sends identifiers and typed values;
the main process resolves all paths and accepts only supported fields.

Native settings and community fixes can overlap. The hub explains known overrides instead of
silently changing both configurations. An installed patch without a configuration is marked
Needs setup. Initializing it is an explicit action, followed by review and Save Changes.
Unknown versions and unverified fields are not written.

Backups live under the hub's data directory, in `settings-backups/<game>/<transaction>/`, with a
manifest recording the original paths. Game processes and configuration tools must be closed
before saving because they may rewrite their settings on exit. Unrelated keys, comments and
binary fields are preserved. Unsupported native settings remain available in the game's own
launcher until their storage and menu behavior are verified.

This feature does not install or update mods. Menu music and sound effects are separate work.

Supported configuration adapters cover MGSM2Fix 3.7.2, MGSHDFix 4.1.1,
MGSPatriotFix 0.2.1, Sunny Side Up 1.0.6, and the installed MGS2/MGS3 Community
Bugfix Compilations. PW Passcode Restoration and MGSFPSUnlock can be identified
without claiming they have editable settings. Detection confirms files are installed;
it does not claim a patch loaded successfully in a running game.

Native graphics presets preserve remembered Custom values. Editing an individual graphics
option from Original or Adjusted Mode automatically selects Custom and keeps the other
currently displayed values. Unavailable controls can receive focus to explain their restriction.
Display-dependent choices
use a verified single-display mapping. Multiple-display ordering and unsupported DLC
states remain unavailable until they can be verified. The native launcher remains the
source for options that cannot yet be mapped safely.

# Playnite

Metal Gear Launcher replaces Playnite's six separate Master Collection entries with one launcher
tile, and can also jump straight to a single game from its own tile.

## One tile for the whole collection

Add a custom game in Playnite (**Library -> Add Game -> Add Manually**, or **Custom Game**
from the toolbar):

| Field | Value |
|---|---|
| Name | `Metal Gear Launcher` |
| Action type | File |
| Path | the launcher's installed `Metal Gear Launcher.exe` (use the Start menu shortcut's target to find the install folder) |
| Arguments | (none) |

Launching this tile opens the hub on whichever game it last remembered, or on the first game
if this is a fresh install.

## Optional: one tile per game

To jump directly to a specific game (skipping the hub's own game-selection screen), add a
custom game per title with the `--game` flag:

| Field | Value |
|---|---|
| Action type | File |
| Path | `Metal Gear Launcher.exe` (same install path as above) |
| Arguments | `--game mgs3` |

Valid ids: `mg12`, `mgs1`, `mgs2`, `mgs3`, `mgs4`, `mgspw`. If the hub is already running, a
second launch with `--game` hands the id to the running window instead of opening a new one.

After upgrading from MGS Master Hub, update existing Playnite actions to the renamed executable.

## Hide the Steam entries

The Master Collection installs as several separate Steam apps (the hub app plus one per game
and bonus content), which Playnite's Steam library import will otherwise list individually
alongside the hub's own tile. Either:

- **Hide them**: select each Master Collection Steam entry in Playnite, right-click ->
  **Hide**, or
- **Exclude them from import**: **Library -> Configure Sources -> Steam**, add each app id to
  the exclusion list (`2131630` MGS1, `2131640` MGS2, `2131650` MGS3, `2131680` MG1&2,
  `2492670` MGS4, `2492660` Peace Walker, plus the two hub/bonus apps).

Either approach keeps Playnite's library to a single Master Collection tile that opens
straight into the hub.

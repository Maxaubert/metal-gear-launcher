# Metal Gear Launcher

## Build, test, release
- Typecheck/lint: `npm run typecheck` and `npm run lint`
- Unit: `npm test`
- E2E (headless): `npm run e2e`    Run when: UI or Electron app-shell changes
- Build / package: `npm run dist`   Artifact: `MetalGearLauncher-Setup-x64-<version>.exe`. Music comes from local game installations or user files, never the installer.
- Known failures to tolerate: none
- Version source: `package.json`   Release: release.yml on push to main
- Routine local installs: `pwsh -File scripts/install.ps1` after packaging; confirm ProductVersion. Preserve settings, personal books, music and all extraction caches so upgrades reuse prepared content.
- Use `scripts/install-clean.ps1` only when Ove explicitly requests a clean/first-run test. Never reset launcher data during routine installs, or Steam/game settings and saves at any time.
- Install helpers dispatch outside packaged terminals to avoid MSIX AppData virtualization. Verify installed-app files from that ordinary user context, not only the terminal's AppData view.
- Leave the final local installation unlaunched after verification, unless Ove asks otherwise.
- Deploy: installer via GitHub Releases
- Signing: unsigned

Keep app ID `com.maxaubert.mgsmasterhub` and `%LOCALAPPDATA%\MGSMasterHub\` stable for upgrades.
No Konami assets are committed. Extraction writes only to the hub data folder and its temporary folder.
Validate IPC input with zod and return `{ ok: true, value }` or `{ ok: false, error }`.
Always open a PR; never merge without explicit user approval.

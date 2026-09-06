# MGS Master Hub

## Build, test, release
- Typecheck: `npm run typecheck`   Lint: `npm run lint`
- Unit: `npm test`
- E2E (headless): `npm run e2e`
- Dev: `npm run dev` (fullscreen; set `HUB_WINDOWED=1` to run windowed)
- Build / package: `npm run dist`   Artifact: `MGS-Master-Hub-Setup-x64-<version>.exe`
- First dist on a machine: `npm run fetch-tools`
- Known failures to tolerate: none
- Version source: `package.json`   Release: release.yml on push to main
- Deploy: installer via GitHub Releases
- Signing: unsigned until the repo is enrolled with SignPath

## Notes
- No Konami assets are ever committed to this repo. E2E fixtures are hand-made PNGs and a
  silent WAV.
- Extraction never writes outside `%LOCALAPPDATA%\MGSMasterHub\` and a temp folder it deletes.
- Every IPC handler validates its input with zod and returns `{ ok: true, value }` or
  `{ ok: false, error }`.

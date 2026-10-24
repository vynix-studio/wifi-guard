# Packaging WiFiGuard as a standalone desktop app

WiFiGuard ships as a native-feeling desktop app: no browser tab, a system
tray icon, and the detection engine running silently in the background.
This is done in two layers:

1. **Backend → single executable (PyInstaller).** `backend/app.py` and
   the `wifiguard` package are bundled into one console-free executable
   per OS (`wifiguard-backend` / `wifiguard-backend.exe`), with the built
   frontend embedded inside it. See `wifiguard.spec`.
2. **Electron shell → installer (electron-builder).** `electron/main.js`
   spawns that executable as a hidden background process, shows a native
   window pointed at it (no address bar, no menu bar), and adds a tray
   icon so closing the window hides the app instead of quitting it —
   `electron/package.json`'s `build` section turns that into a real
   installer (`.AppImage` / `.deb` on Linux, `.exe` on Windows).

## Why two separate build steps per OS

Neither PyInstaller nor electron-builder's native installer targets
cross-compile: each one builds for the OS it's actually running on. A
Windows `.exe` can only be produced on Windows (or a Windows CI runner);
a Linux `.deb`/AppImage only on Linux. There's no way around this short
of a full cross-compilation toolchain (Wine for electron-builder, plus a
cross Python build for PyInstaller) that isn't reliable enough to depend
on for a release. The straightforward fix is simply to build each target
on its own OS — see the GitHub Actions workflow below, which does exactly
that automatically.

## Building manually, on each OS

```bash
# 1. Build the frontend (from the repo root)
pnpm install
pnpm run build

# 2. Build the backend executable (from the repo root)
pip install -e backend
pip install pyinstaller
pyinstaller packaging/wifiguard.spec --distpath packaging/dist --workpath packaging/build --noconfirm

# 3. Build the Electron installer (from electron/)
cd electron
npm install
npm run dist:linux   # or: npm run dist:win   (run the matching one on each OS)
```

Installers land in `packaging/installers/`.

## Building both automatically (recommended)

`.github/workflows/build-desktop.yml` builds the Linux and Windows
installers in parallel, each on its own GitHub-hosted runner, and
uploads both as workflow artifacts. Trigger it manually from the Actions
tab, or push a `v*` tag. This is the easiest way to get a real Windows
`.exe` without owning a Windows machine.

## What was verified during development (on Linux, no real display)

- The PyInstaller backend executable runs standalone from a completely
  unrelated directory, correctly resolves its bundled frontend, and
  serves `/api/health`, `/`, and every other route identically to
  `python app.py` in dev.
- The Electron shell (`npm start`, dev mode) launches under Xvfb, spawns
  the backend, waits for its health check, and loads the full dashboard;
  live calls to `/api/networks`, `/api/trusted`, and `/api/settings` all
  succeeded.
- The actual built AppImage (extracted and run directly, since this
  sandbox has no FUSE) does the same end-to-end, from its own bundled
  `resources/backend/wifiguard-backend` — not a dev-mode fallback.
- No orphaned `wifiguard-backend` process was left running in any of the
  above after the app was killed.
- The `.deb`'s metadata (`dpkg-deb -I`) is well-formed: correct name,
  maintainer, dependencies, and description.

What wasn't verified here, for lack of a real display/window manager in
this sandbox: actually clicking the tray icon, confirming the window
visually has no menu bar, and the Windows build (no Windows machine or
Wine available). Worth a real click-through on your own machine (or the
Debian test machine) before the defense, and a run of the GitHub Actions
workflow (or a build on an actual Windows machine) to produce and test
the `.exe`.

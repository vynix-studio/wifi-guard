# PyInstaller spec for the WiFiGuard backend.
#
# Produces a single, console-free executable that bundles:
#   - the Flask/SocketIO backend and the wifiguard detection/scanner/
#     storage package (backend/app.py, backend/wifiguard/)
#   - the already-built frontend (repo-root dist/), unpacked at runtime
#     under "frontend_dist" — see resolve_dist_dir() in backend/app.py,
#     which looks for exactly that path when sys.frozen is True.
#
# Build (from the repo root, after `pnpm run build` has produced dist/):
#   pyinstaller packaging/wifiguard.spec --distpath packaging/dist --workpath packaging/build
#
# The Electron shell spawns the resulting executable as a hidden child
# process; it is never meant to be launched directly by an end user, so
# console=False here is what actually prevents the console-window flash
# on Windows that the user explicitly asked to avoid.

import os

block_cipher = None

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(SPEC)), ".."))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
FRONTEND_DIST = os.path.join(REPO_ROOT, "dist")

if not os.path.isdir(FRONTEND_DIST):
    raise SystemExit(
        f"Frontend build not found at {FRONTEND_DIST}. Run `pnpm run build` "
        "in the repo root before building the backend executable."
    )

a = Analysis(
    [os.path.join(BACKEND_DIR, "app.py")],
    pathex=[BACKEND_DIR],
    binaries=[],
    datas=[
        (FRONTEND_DIST, "frontend_dist"),
    ],
    hiddenimports=[
        # flask-socketio picks an async driver (eventlet/gevent/threading)
        # at runtime by probing for installed packages; PyInstaller's
        # static analysis doesn't see that dynamic import, so the
        # threading driver (the one actually used here, since neither
        # eventlet nor gevent is a dependency of this project) must be
        # listed explicitly or socketio.run() fails at startup in the
        # frozen build with "No async mode selected".
        "engineio.async_drivers.threading",
        "wifiguard",
        "wifiguard.detection",
        "wifiguard.detection.engine",
        "wifiguard.scanner",
        "wifiguard.scanner.linux_scanner",
        "wifiguard.scanner.windows_scanner",
        "wifiguard.storage",
        "wifiguard.storage.db",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="wifiguard-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # console=False is the actual fix for "I do not want to see a command
    # line": without it, Windows briefly flashes a console window every
    # time Electron spawns this executable.
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

// WiFiGuard Electron shell.
//
// This process's only jobs are: start the backend (as a hidden child
// process, no console window), show a native window pointed at it, and
// keep that backend running in the background via a system tray icon —
// closing the window hides it instead of quitting, same as how WhatsApp
// Desktop/Netflix behave. Quitting from the tray menu (or Cmd/Ctrl+Q) is
// the only thing that actually stops the backend.
//
// All detection, scanning, and scoring logic lives in the Python backend
// (see backend/app.py and packaging/wifiguard.spec); this file has no
// WiFiGuard-specific logic of its own beyond "start it, show it, hide
// it, stop it."

const { app, BrowserWindow, Tray, Menu, shell, Notification } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 5000;
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;

// Set once the user deliberately picks "Stop Server" from the tray menu.
// Tells the crash-recovery logic below to stand down instead of trying to
// bring the backend back up — the user asked for it to be stopped.
let manualStop = false;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BACKOFF_MS = 2000;

function backendExecutablePath() {
  // In development, run the backend straight from source with the
  // system/venv Python so there's no PyInstaller build step in the
  // inner dev loop. In a packaged app, electron-builder places the
  // PyInstaller-built binary under process.resourcesPath (see
  // electron/package.json's "extraResources" and
  // packaging/wifiguard.spec), named per-OS exactly as PyInstaller
  // produces it.
  if (!app.isPackaged) {
    return null; // signals "use the dev Python path" below
  }
  const exeName = process.platform === "win32" ? "wifiguard-backend.exe" : "wifiguard-backend";
  return path.join(process.resourcesPath, "backend", exeName);
}

function startBackend() {
  const exePath = backendExecutablePath();

  if (exePath) {
    backendProcess = spawn(exePath, [], {
      // 'ignore' for stdio (rather than 'inherit' or 'pipe') is part of
      // what keeps this fully silent: no console window is created to
      // attach output to, on either OS.
      stdio: "ignore",
      windowsHide: true, // belt-and-suspenders: also suppresses the
      // console window Windows would otherwise briefly flash when
      // spawning a console-subsystem child, even though the PyInstaller
      // build itself is already windowed (console=False in the .spec).
      detached: false,
    });
  } else {
    // Development: run the backend from source. Assumes `uv` (or a
    // regular `python3` with the backend deps installed) is on PATH;
    // see backend/README.md for setup.
    const backendDir = path.join(__dirname, "..", "backend");
    const pythonCmd = process.env.WIFIGUARD_PYTHON || "python3";
    backendProcess = spawn(pythonCmd, ["app.py"], {
      cwd: backendDir,
      stdio: "inherit", // keep output visible in dev
      env: { ...process.env, WIFIGUARD_DEV: process.env.WIFIGUARD_DEV || "1" },
    });
  }

  backendProcess.on("error", (err) => {
    console.error("Failed to start WiFiGuard backend:", err);
  });

  backendProcess.on("exit", (code, signal) => {
    backendProcess = null;
    if (isQuitting || manualStop) {
      // Expected: either the whole app is quitting, or the user asked
      // for the server to be stopped from the tray. Don't auto-restart.
      updateTrayMenu();
      return;
    }
    // Unexpected death (crash, driver hiccup, killed from outside). Try
    // to bring it back automatically rather than leaving the window
    // stuck showing a dead connection with no explanation.
    console.error(`WiFiGuard backend exited unexpectedly (code=${code}, signal=${signal})`);
    scheduleBackendRestart();
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = null;
}

/** Called whenever the backend disappears on its own — a crash while
 * running, or it simply never came up in the first place. Retries with a
 * short backoff so a flaky scan/driver hiccup doesn't require the user to
 * notice and manually restart the whole app. Gives up after
 * MAX_RESTART_ATTEMPTS and notifies instead of retrying forever. */
function scheduleBackendRestart() {
  restartAttempts += 1;
  if (restartAttempts > MAX_RESTART_ATTEMPTS) {
    console.error(`WiFiGuard backend failed to come up after ${MAX_RESTART_ATTEMPTS} attempts; giving up.`);
    notifyBackendDown();
    updateTrayMenu();
    return;
  }
  setTimeout(async () => {
    if (isQuitting || manualStop) return;
    startBackend();
    const ready = await waitForBackend(8000);
    if (ready) {
      restartAttempts = 0;
      if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
    } else {
      scheduleBackendRestart();
      return;
    }
    updateTrayMenu();
  }, RESTART_BACKOFF_MS);
}

function notifyBackendDown() {
  if (Notification.isSupported()) {
    new Notification({
      title: "WiFiGuard",
      body: "The background monitoring service stopped responding and couldn't restart itself. Use the tray icon's \"Start Server\" to try again.",
    }).show();
  }
}

/** Tray action: deliberately stop everything — the backend process and
 * the visible window — while leaving the tray icon itself running so the
 * app can be started again without relaunching it from the installer. */
function stopServer() {
  manualStop = true;
  stopBackend();
  if (mainWindow) mainWindow.hide();
  updateTrayMenu();
}

/** Tray action: the counterpart to stopServer() — spins the backend back
 * up and shows the window again once it's ready. */
function startServer() {
  manualStop = false;
  restartAttempts = 0;
  startBackend();
  waitForBackend().then((ready) => {
    if (ready) {
      if (mainWindow) {
        mainWindow.webContents.reloadIgnoringCache();
        mainWindow.show();
      }
    } else {
      scheduleBackendRestart();
    }
    updateTrayMenu();
  });
}

/** Poll the backend's health endpoint until it responds, so the window
 * doesn't briefly show a connection-refused error on first launch while
 * Flask is still starting up. Gives up after ~10s and loads anyway. */
function waitForBackend(timeoutMs = 10000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(`${BACKEND_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
        } else if (Date.now() < deadline) {
          setTimeout(check, intervalMs);
        } else {
          resolve(false);
        }
      });
      req.on("error", () => {
        if (Date.now() < deadline) {
          setTimeout(check, intervalMs);
        } else {
          resolve(false);
        }
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "WiFiGuard",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true, // no File/Edit/View menu bar — this isn't a browser
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Links WiFiGuard itself doesn't define (there are none today, but if
  // a future version adds an "external docs" link) should open in the
  // user's real browser, never navigate this window away from the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(BACKEND_URL);

  // "Close" minimizes to tray instead of quitting, so the backend (and
  // its scanning/alerting) keeps running in the background — the whole
  // point of this packaging work. Only the tray's "Quit WiFiGuard" (or
  // the OS-level quit shortcut, which sets isQuitting first) actually
  // closes the app.
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, "build", "icon.png"));
  tray.setToolTip("WiFiGuard — monitoring in the background");
  updateTrayMenu();

  // Left-click the tray icon to open/focus the window (standard tray-app
  // behavior on Windows/Linux; macOS users still have the Dock + menu).
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    }
  });
}

/** Rebuilds the tray's right-click menu to reflect current state (whether
 * the server is running) — this menu is the "hidden" control surface for
 * stopping/starting/restarting WiFiGuard without digging through the
 * window UI, since it's tucked behind a right-click rather than shown as
 * its own button. Called on every state change so the Stop/Start label
 * and enabled-ness always match reality. */
function updateTrayMenu() {
  if (!tray) return;
  const serverRunning = backendProcess !== null;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open WiFiGuard",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    serverRunning
      ? {
          label: "Stop Server",
          click: stopServer,
        }
      : {
          label: "Start Server",
          click: startServer,
        },
    {
      label: "Restart Server",
      click: () => {
        manualStop = false;
        restartAttempts = 0;
        stopBackend();
        setTimeout(startServer, 300);
      },
    },
    { type: "separator" },
    {
      label: "Quit WiFiGuard",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
  startBackend();
  createTray();
  createWindow();

  const ready = await waitForBackend();
  if (ready) {
    restartAttempts = 0;
  } else {
    // Don't just give up and show a dead window — this is exactly the
    // "Electron can't reach the backend, so spin it up again" case.
    console.error("WiFiGuard backend did not become ready in time; will keep retrying in the background.");
    scheduleBackendRestart();
  }
  // loadURL was already called in createWindow(); reload now so the
  // window picks up the backend once it's actually (or eventually) up,
  // rather than leaving it stuck on its first failed load.
  mainWindow.webContents.reloadIgnoringCache();
  updateTrayMenu();
});

// Keep running in the background on all platforms when every window is
// closed — this is the "don't quit like a normal app" behavior the tray
// exists for. (On macOS this is already Apple's convention; stated here
// explicitly so the same behavior is guaranteed on Windows/Linux too.)
app.on("window-all-closed", () => {
  // Intentionally not calling app.quit() here.
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
});

// Belt-and-suspenders: if Electron itself is killed/crashes, don't leave
// the backend running as an orphaned background process with no UI to
// stop it from.
process.on("exit", stopBackend);

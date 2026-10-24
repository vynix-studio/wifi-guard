"""WiFiGuard backend: Flask JSON API + SocketIO live updates.

Serves the built React frontend (backend/dist, see resolve_dist_dir()
below) directly, so this process alone is a complete, double-clickable
app with no separate frontend dev server needed. For day-to-day frontend
development, running `pnpm run dev` (Vite on :5173) still works too; the
static route here only kicks in for paths Flask doesn't otherwise match.

Run with:
    uv run python app.py

Set WIFIGUARD_DEV=1 to enable Flask/Werkzeug's debug mode (auto-reload,
interactive debugger). Never set this in a packaged build: the debugger
can execute arbitrary code from anyone who can reach the port.

Endpoints:
    GET  /api/networks            -> latest scan results with verdicts
    GET  /api/trusted             -> list of trusted APs
    POST /api/trusted             -> add a trusted AP {ssid, bssid}
    DELETE /api/trusted           -> remove a trusted AP {ssid, bssid}
    GET  /api/alerts              -> recent alert log (DELETE clears it)
    GET/POST /api/scan            -> scanning state / pause or resume
    GET  /api/alerts/export       -> alert log as a CSV download
    GET  /api/settings            -> current settings
    POST /api/settings            -> update settings
    GET  /api/health              -> liveness check
    GET  /, /<anything else>      -> the built frontend (backend/dist)

SocketIO event "update" is emitted after every scan cycle with the same
shape as GET /api/networks, so the frontend can render live without
polling.
"""

import csv
import io
import os
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO

from wifiguard.detection.engine import evaluate
from wifiguard.scanner import scan
from wifiguard.storage.db import (
    add_trusted_ap,
    backfill_trusted_baseline,
    clear_alerts,
    get_alerts,
    get_all_settings,
    get_setting,
    get_trusted_aps,
    get_trusted_baselines,
    get_trusted_set,
    init_db,
    log_alert,
    remove_trusted_ap,
    set_setting,
)

def resolve_dist_dir() -> Path:
    """Locate the built frontend (index.html + assets/).

    Three cases, in order:
    1. Frozen by PyInstaller: bundled data files are unpacked next to the
       executable at runtime under sys._MEIPASS, and the PyInstaller spec
       (see packaging/wifiguard.spec) places the frontend build at
       "frontend_dist" inside that bundle.
    2. Normal `python app.py` run from a built release layout, where the
       frontend build was copied to backend/dist.
    3. Day-to-day development straight from the repo, where the frontend
       build still lives at the repo root's dist/ (`pnpm run build`
       output), one level up from backend/.
    Returns whichever of these actually exists; the static route below
    simply 404s on an unbuilt frontend rather than crashing at import
    time, so the API still works with no frontend built at all.
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "frontend_dist"

    backend_dir = Path(__file__).resolve().parent
    local_dist = backend_dir / "dist"
    if local_dist.exists():
        return local_dist
    return backend_dir.parent / "dist"


DIST_DIR = resolve_dist_dir()

app = Flask(__name__)
CORS(app)  # still useful for `pnpm run dev` on :5173 talking to this on :5000
socketio = SocketIO(app, cors_allowed_origins="*")

state_lock = threading.Lock()
latest_state = {"networks": [], "last_scan": None, "last_scan_at": None, "scanning": True}
last_alerted: dict[str, tuple] = {}  # bssid -> (verdict, score) last written to the log
first_seen: dict[str, str] = {}  # bssid -> ISO time first observed this run
scan_enabled = threading.Event()
scan_enabled.set()


def get_thresholds() -> dict:
    settings = get_all_settings()
    return {
        "rogue": int(settings.get("alert_threshold", 50)),
        "suspicious": int(settings.get("suspicious_threshold", 20)),
    }


def monitor_loop() -> None:
    while True:
        if not scan_enabled.is_set():
            time.sleep(1)
            continue
        try:
            trusted = get_trusted_set()
            baselines = get_trusted_baselines()
            thresholds = get_thresholds()
            raw_networks = scan()
            results = evaluate(raw_networks, trusted, thresholds=thresholds, baselines=baselines)

            # Backfill a missing baseline for any trusted BSSID visible in
            # this scan (trusted via POST /api/trusted before this feature
            # existed, or while it wasn't visible yet). A no-op once a
            # baseline is already recorded. See backfill_trusted_baseline's
            # docstring for why this is a one-time trust assumption, same
            # as marking an AP trusted always was.
            trusted_bssids = set(trusted.values())
            for r in results:
                if r["bssid"] in trusted_bssids and r["bssid"] not in baselines:
                    backfill_trusted_baseline(r["ssid"], r["bssid"], r["channel"], r.get("encryption", ""))

            now_iso = datetime.now().isoformat(timespec="seconds")
            for r in results:
                first_seen.setdefault(r["bssid"], now_iso)
                r["first_seen"] = first_seen[r["bssid"]]
                r["last_seen"] = now_iso
                if r["verdict"] in ("Suspicious", "Rogue"):
                    # Only log when the verdict/score changes, otherwise the
                    # alert log fills with one identical row per scan cycle.
                    key = (r["verdict"], r["score"])
                    if last_alerted.get(r["bssid"]) != key:
                        log_alert(r["ssid"], r["bssid"], r["score"], r["verdict"], r["reasons"])
                        last_alerted[r["bssid"]] = key
                else:
                    last_alerted.pop(r["bssid"], None)

            with state_lock:
                latest_state["networks"] = results
                latest_state["last_scan"] = datetime.now().strftime("%H:%M:%S")
                latest_state["last_scan_at"] = now_iso

            socketio.emit("update", latest_state)
        except Exception as e:  # keep the monitor alive across scan errors
            print(f"[monitor_loop] error: {e}")

        interval = int(get_setting("scan_interval") or 10)
        time.sleep(interval)


# --- API routes --------------------------------------------------------------

@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/networks")
def networks():
    with state_lock:
        return jsonify(latest_state)


@app.route("/api/trusted", methods=["GET", "POST", "DELETE"])
def trusted():
    if request.method == "GET":
        return jsonify(get_trusted_aps())

    data = request.get_json(silent=True) or {}
    ssid = data.get("ssid")
    bssid = data.get("bssid")
    if not ssid or not bssid:
        return jsonify({"error": "ssid and bssid are required"}), 400

    if request.method == "POST":
        # Capture this BSSID's current channel/encryption from the latest
        # scan as its baseline, so later drift (e.g. an Evil Twin that
        # clones this exact BSSID but downgrades encryption) can be
        # caught even if it's the only entry seen for this SSID in a
        # given scan. If it's not in the latest scan (added by hand
        # without a live network, or scanning was paused), there's
        # nothing to capture — add_trusted_ap() just leaves the baseline
        # unset, same as before this feature existed.
        baseline_channel = None
        baseline_encryption = None
        with state_lock:
            for net in latest_state.get("networks", []):
                if net.get("bssid") == bssid.lower():
                    baseline_channel = net.get("channel")
                    baseline_encryption = net.get("encryption")
                    break
        add_trusted_ap(ssid, bssid, baseline_channel, baseline_encryption)
    else:
        remove_trusted_ap(ssid, bssid)

    return jsonify(get_trusted_aps())


@app.route("/api/alerts", methods=["GET", "DELETE"])
def alerts():
    if request.method == "DELETE":
        clear_alerts()
    return jsonify(get_alerts())


@app.route("/api/scan", methods=["GET", "POST"])
def scan_control():
    """GET -> {scanning}; POST {scanning: bool} pauses/resumes the monitor."""
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        if data.get("scanning", True):
            scan_enabled.set()
        else:
            scan_enabled.clear()
        with state_lock:
            latest_state["scanning"] = scan_enabled.is_set()
        socketio.emit("update", latest_state)
    return jsonify({"scanning": scan_enabled.is_set()})


@app.route("/api/alerts/export")
def export_alerts():
    rows = get_alerts(limit=10_000)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "timestamp", "ssid", "bssid", "score", "verdict", "reasons"])
    for row in rows:
        writer.writerow(
            [row["id"], row["timestamp"], row["ssid"], row["bssid"], row["score"], row["verdict"], row["reasons"]]
        )

    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=wifiguard_alerts.csv"},
    )


@app.route("/api/settings", methods=["GET", "POST"])
def settings_route():
    if request.method == "GET":
        return jsonify(get_all_settings())

    data = request.get_json(silent=True) or {}
    for key in ("scan_interval", "alert_threshold", "suspicious_threshold"):
        if key in data:
            set_setting(key, str(data[key]))

    return jsonify(get_all_settings())


# --- frontend static files ---------------------------------------------------
# Registered last so they only ever catch a path none of the /api/* routes
# or Socket.IO's own /socket.io/ path already matched. Vite builds with
# root-relative asset paths (e.g. /assets/index-XXXX.js), so serving
# everything straight from DIST_DIR at the site root, rather than under a
# /static/ prefix, is what the built index.html actually expects.

@app.route("/")
def frontend_index():
    index_path = DIST_DIR / "index.html"
    if not index_path.exists():
        return (
            "WiFiGuard backend is running, but no built frontend was found "
            f"at {DIST_DIR}. Run `pnpm run build` in the frontend directory, "
            "or use `pnpm run dev` and open http://localhost:5173 instead.",
            404,
        )
    return send_from_directory(DIST_DIR, "index.html")


@app.route("/<path:path>")
def frontend_asset(path: str):
    full_path = DIST_DIR / path
    if full_path.is_file():
        return send_from_directory(DIST_DIR, path)
    # Not a known static file: fall back to index.html rather than a bare
    # 404. There's no client-side router in this app today, but this keeps
    # a direct deep link (or a future router) from dead-ending, the same
    # way any SPA static host is configured.
    return frontend_index()


if __name__ == "__main__":
    init_db()
    if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        threading.Thread(target=monitor_loop, daemon=True).start()
    # debug=True enables the Werkzeug interactive debugger, which can
    # execute arbitrary code reflected from a request — fine on a
    # developer's own machine, never acceptable in a packaged build that
    # ships to someone else's computer. WIFIGUARD_DEV opts in explicitly;
    # everything else (including every packaged/frozen run) stays off.
    dev_mode = os.environ.get("WIFIGUARD_DEV") == "1"
    # flask-socketio refuses to run its bundled Werkzeug server outside
    # debug mode unless this is set, since Werkzeug's dev server isn't
    # meant for a public production deployment. That warning doesn't apply
    # here: this app only ever binds to 127.0.0.1 for a single local user
    # (see host= above), never a multi-user internet-facing service.
    socketio.run(
        app,
        host="127.0.0.1",
        port=5000,
        debug=dev_mode,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )

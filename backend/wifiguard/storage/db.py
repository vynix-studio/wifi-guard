"""SQLite storage layer: trusted APs, alert log, and app settings.

Plain sqlite3, no ORM.
"""

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "wifiguard.db"

DEFAULT_SETTINGS = {
    "scan_interval": "10",
    "alert_threshold": "50",
    "suspicious_threshold": "20",
}


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trusted_aps (
                ssid TEXT NOT NULL,
                bssid TEXT NOT NULL,
                added_on TEXT NOT NULL,
                PRIMARY KEY (ssid, bssid)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                ssid TEXT NOT NULL,
                bssid TEXT NOT NULL,
                score INTEGER NOT NULL,
                verdict TEXT NOT NULL,
                reasons TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
    _migrate_trusted_aps_baseline_columns()
    init_settings()


def _migrate_trusted_aps_baseline_columns() -> None:
    """Add baseline_channel/baseline_encryption to trusted_aps if missing.

    These record what a trusted AP's channel/encryption looked like at the
    moment it was marked trusted, so later scans of that exact BSSID can be
    checked for drift (see the "Baseline drift" rule in detection/engine.py)
    even when it's the only entry seen for that SSID in a given scan (e.g. a
    perfect BSSID clone collapses to one scan result, so there's nothing
    else in that scan to compare it against — but there's still this
    baseline). CREATE TABLE IF NOT EXISTS above won't add columns to a
    trusted_aps table that already existed before this feature, so handle
    that explicitly here; safe to run on every startup.
    """
    with get_conn() as conn:
        existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(trusted_aps)")}
        if "baseline_channel" not in existing_cols:
            conn.execute("ALTER TABLE trusted_aps ADD COLUMN baseline_channel INTEGER")
        if "baseline_encryption" not in existing_cols:
            conn.execute("ALTER TABLE trusted_aps ADD COLUMN baseline_encryption TEXT")


def init_settings() -> None:
    with get_conn() as conn:
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )


# --- trusted APs -----------------------------------------------------------

def add_trusted_ap(
    ssid: str,
    bssid: str,
    baseline_channel: int | None = None,
    baseline_encryption: str | None = None,
) -> None:
    """Mark an AP trusted. If the caller has the AP's current channel and
    encryption on hand (app.py looks these up from the live scan at the
    moment the request comes in), record them as the baseline for drift
    detection. Re-trusting an already-trusted BSSID refreshes the baseline
    to whatever is passed this time (or clears it, if not passed) rather
    than keeping a stale one around indefinitely."""
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO trusted_aps "
            "(ssid, bssid, added_on, baseline_channel, baseline_encryption) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                ssid,
                bssid.lower(),
                datetime.now().isoformat(timespec="seconds"),
                baseline_channel,
                baseline_encryption,
            ),
        )


def remove_trusted_ap(ssid: str, bssid: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM trusted_aps WHERE ssid = ? AND bssid = ?",
            (ssid, bssid.lower()),
        )


def get_trusted_aps() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT ssid, bssid, added_on, baseline_channel, baseline_encryption "
            "FROM trusted_aps ORDER BY added_on DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def get_trusted_set() -> dict[str, str]:
    """Return {ssid: bssid} for use by the detection engine."""
    return {row["ssid"]: row["bssid"] for row in get_trusted_aps()}


def get_trusted_baselines() -> dict[str, dict]:
    """Return {bssid: {"channel": int|None, "encryption": str|None}} for
    every trusted AP that has a recorded baseline, for the detection
    engine's baseline-drift check. A BSSID with no baseline recorded
    (added before this feature existed, or added while that network
    wasn't visible in a scan) simply won't appear here, and the baseline
    check is skipped for it — same as before this feature existed."""
    baselines = {}
    for row in get_trusted_aps():
        if row["baseline_channel"] is None and row["baseline_encryption"] is None:
            continue
        baselines[row["bssid"]] = {
            "channel": row["baseline_channel"],
            "encryption": row["baseline_encryption"],
        }
    return baselines


# --- alert log ---------------------------------------------------------------

def log_alert(ssid: str, bssid: str, score: int, verdict: str, reasons: list[str]) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO alert_log (timestamp, ssid, bssid, score, verdict, reasons) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                datetime.now().isoformat(timespec="seconds"),
                ssid,
                bssid,
                score,
                verdict,
                "; ".join(reasons),
            ),
        )


def get_alerts(limit: int = 200) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, timestamp, ssid, bssid, score, verdict, reasons "
            "FROM alert_log ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def clear_alerts() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM alert_log")


# --- settings ------------------------------------------------------------

def get_setting(key: str) -> str | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
        return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, str(value)),
        )


def get_all_settings() -> dict[str, str]:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        return {row["key"]: row["value"] for row in rows}

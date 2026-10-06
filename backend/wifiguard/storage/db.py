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
    init_settings()


def init_settings() -> None:
    with get_conn() as conn:
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )


# --- trusted APs -----------------------------------------------------------

def add_trusted_ap(ssid: str, bssid: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO trusted_aps (ssid, bssid, added_on) "
            "VALUES (?, ?, ?)",
            (ssid, bssid.lower(), datetime.now().isoformat(timespec="seconds")),
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
            "SELECT ssid, bssid, added_on FROM trusted_aps ORDER BY added_on DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def get_trusted_set() -> dict[str, str]:
    """Return {ssid: bssid} for use by the detection engine."""
    return {row["ssid"]: row["bssid"] for row in get_trusted_aps()}


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

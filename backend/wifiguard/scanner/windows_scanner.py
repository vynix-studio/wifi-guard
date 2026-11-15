"""Wi-Fi scanning on Windows using the native `netsh` CLI.

We deliberately avoid third-party Wi-Fi libraries (e.g. pywifi) because they
are poorly maintained and unreliable across driver versions. Shelling out to
the OS-native tool is slower per call but far more dependable.
"""

import re
import subprocess
import sys
import time

# netsh is a console app, so every subprocess.run() call against it briefly
# flashes a console window of its own on Windows -- even though this app
# itself runs with no console (see packaging/wifiguard.spec, console=False).
# Each Wi-Fi scan shells out to netsh, so without this the user sees a
# command-prompt window flash on every refresh. CREATE_NO_WINDOW tells
# Windows not to allocate a console for the child process at all.
# subprocess.CREATE_NO_WINDOW only exists on Windows, so guard it for the
# Linux/macOS case where this module still gets imported (even if unused).
_NO_WINDOW_FLAGS = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0

# How long to give Windows' own scan to finish before we read the results
# back out. `netsh wlan scan` returns as soon as the scan is *requested*,
# not once it's done -- reading immediately after would just hand us the
# stale cache again, defeating the point.
_SCAN_SETTLE_SECONDS = 2.0


def _trigger_scan() -> None:
    """Ask Windows' WLAN AutoConfig service to scan right now.

    `netsh wlan show networks` never does this itself -- it only reads
    whatever that service already has cached, and the service refreshes
    that cache on its own schedule (roughly every 60s when idle, far less
    often while already connected to a network). That's why a new or
    changed access point could take a long time to appear, and why
    opening Windows' own Wi-Fi flyout made it show up immediately: that
    UI calls the scan API directly, which this tool previously never
    did. `netsh wlan scan` issues that same request. Its own failures are
    ignored here -- if it's unsupported on this Windows build, we fall
    back to whatever's already cached rather than breaking the scan.
    """
    subprocess.run(
        ["netsh", "wlan", "scan"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        creationflags=_NO_WINDOW_FLAGS,
    )


def get_raw_scan_output() -> str:
    """Run `netsh wlan show networks mode=bssid` and return its raw stdout."""
    _trigger_scan()
    time.sleep(_SCAN_SETTLE_SECONDS)
    result = subprocess.run(
        ["netsh", "wlan", "show", "networks", "mode=bssid"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        creationflags=_NO_WINDOW_FLAGS,
    )
    return result.stdout


def parse_scan_output(raw_output: str) -> list[dict]:
    """Parse the text output of `netsh wlan show networks mode=bssid`.

    netsh groups output by SSID, and within each SSID block lists one or
    more BSSIDs with their own signal/channel/auth info. We flatten this
    into one dict per physical access point (per BSSID).
    """
    networks: list[dict] = []

    # Split into per-SSID blocks. Each block starts with "SSID n : <name>"
    ssid_blocks = re.split(r"\n(?=SSID \d+ : )", raw_output)

    for block in ssid_blocks:
        ssid_match = re.search(r"SSID \d+ : (.*)", block)
        if not ssid_match:
            continue
        ssid = ssid_match.group(1).strip()

        auth_match = re.search(r"Authentication\s*:\s*(.*)", block)
        encryption_match = re.search(r"Encryption\s*:\s*(.*)", block)
        authentication = auth_match.group(1).strip() if auth_match else "Unknown"
        encryption = encryption_match.group(1).strip() if encryption_match else "Unknown"

        # Each BSSID entry starts with "BSSID n : <mac>"
        bssid_entries = re.split(r"\n(?=\s*BSSID \d+\s*:)", block)
        for entry in bssid_entries:
            bssid_match = re.search(r"BSSID \d+\s*:\s*([0-9a-fA-F:]{17})", entry)
            if not bssid_match:
                continue
            bssid = bssid_match.group(1).strip().lower()

            signal_match = re.search(r"Signal\s*:\s*(\d+)%", entry)
            channel_match = re.search(r"Channel\s*:\s*(\d+)", entry)

            signal = int(signal_match.group(1)) if signal_match else 0
            channel = int(channel_match.group(1)) if channel_match else 0

            networks.append(
                {
                    "ssid": ssid,
                    "bssid": bssid,
                    "signal": signal,
                    "channel": channel,
                    "authentication": authentication,
                    "encryption": encryption,
                }
            )

    return networks


def scan() -> list[dict]:
    raw = get_raw_scan_output()
    return parse_scan_output(raw)

"""Wi-Fi scanning on Linux using the native `nmcli` CLI (NetworkManager).

Same rationale as the Windows scanner: avoid pywifi, shell out to the
OS-native, well-maintained tool instead.
"""

import subprocess


def get_raw_scan_output() -> str:
    """Run nmcli in terse mode and return its raw stdout.

    -t          terse, colon-separated, scriptable output
    -f ...      only the fields we need
    --rescan yes  force a fresh scan instead of using a stale cache
    """
    result = subprocess.run(
        [
            "nmcli",
            "-t",
            "-f",
            "SSID,BSSID,SIGNAL,CHAN,SECURITY",
            "device",
            "wifi",
            "list",
            "--rescan",
            "yes",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    return result.stdout


def _split_terse_line(line: str) -> list[str]:
    """Split an nmcli -t line on unescaped colons.

    nmcli escapes literal colons inside a field (e.g. inside the BSSID)
    with a backslash, so a naive line.split(":") would shred the MAC
    address. We walk the string and only split on ":" that isn't
    preceded by a backslash, then strip the escape characters back out.
    """
    fields: list[str] = []
    current = []
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == "\\" and i + 1 < len(line):
            current.append(line[i + 1])
            i += 2
            continue
        if ch == ":":
            fields.append("".join(current))
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1
    fields.append("".join(current))
    return fields


def parse_scan_output(raw_output: str) -> list[dict]:
    networks: list[dict] = []

    for line in raw_output.splitlines():
        line = line.strip()
        if not line:
            continue

        fields = _split_terse_line(line)
        if len(fields) < 5:
            continue

        ssid, bssid, signal_str, chan_str, security = fields[:5]

        if not bssid:
            continue

        try:
            signal = int(signal_str)
        except ValueError:
            signal = 0

        try:
            channel = int(chan_str)
        except ValueError:
            channel = 0

        security = security.strip() or "Open"

        networks.append(
            {
                "ssid": ssid or "(hidden)",
                "bssid": bssid.lower(),
                "signal": signal,
                "channel": channel,
                # nmcli reports a single combined security string
                # (e.g. "WPA2", "WPA1 WPA2", ""); we mirror it into both
                # fields so the detection engine's shape matches the
                # Windows scanner's authentication/encryption pair.
                "authentication": security,
                "encryption": security,
            }
        )

    return networks


def scan() -> list[dict]:
    raw = get_raw_scan_output()
    return parse_scan_output(raw)

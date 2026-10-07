"""Evil Corp: a controlled Evil Twin attack simulator for WiFiGuard testing.

Runs on a Kali/Debian Linux machine. Lets you pick a real nearby network
from a Tkinter GUI, choose a test scenario, and launch/stop a cloned AP
with hostapd — instead of typing hostapd invocations by hand on the
command line.

Scenarios:
  1. Evil Twin              - open, BSSID + encryption mismatch (the
                               classic attack: same SSID, no password,
                               different hardware).
  2. False Positive Check   - same SSID, matching WPA2, same channel. Used
                               to confirm WiFiGuard does NOT flag a network
                               that merely has two legitimate access points
                               with the same SSID (e.g. mesh/AP roaming).
  3. Channel Variance Only  - same SSID, matching WPA2, different channel.
                               Isolates the channel-mismatch detection rule
                               on its own, without an encryption downgrade.
  4. BSSID Clone + Matching Security - spoofs this machine's wireless MAC
                               to exactly match the target's BSSID (so OUI
                               matches too), keeps WPA2 matching, same
                               channel. Nothing about the broadcast differs
                               from the real AP except it's a second
                               physical radio — tests whether the detector
                               has any signal left to catch a true MAC
                               clone, or whether it's fully invisible to it.
  5. BSSID Clone + Open Security - same MAC spoof as #4, but drops
                               encryption to open. Isolates the
                               encryption-downgrade signal on its own, with
                               BSSID/OUI/channel all otherwise matching.

Scenarios 4 and 5 change this machine's own wireless MAC address and
restore it afterward (on Stop Attack or Restore Networking) — see
_spoof_mac / _restore_mac_async.

Requires: a Debian/Kali-family Linux with hostapd, NetworkManager, and
iproute2 (`ip`, standard on any such system), plus a wireless interface
capable of AP (master) mode. Passwordless sudo for hostapd and for the
specific `ip link set <iface> ...` commands used to spoof/restore the MAC
is set up by setup.sh.
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


def _interface_exists(iface: str) -> bool:
    return os.path.isdir(os.path.join("/sys/class/net", iface))


def _read_mac(iface: str) -> str | None:
    """Read an interface's current MAC address from sysfs, or None if it
    can't be read (interface missing, permissions, etc.)."""
    try:
        with open(os.path.join("/sys/class/net", iface, "address")) as f:
            return f.read().strip()
    except OSError:
        return None


INTERFACE = _detect_interface()
CONF_PATH = os.path.expanduser("~/wifiguard-tests/generated_attack.conf")

SCENARIOS = {
    "evil_twin": {
        "label": "Test 1: Evil Twin (Open, BSSID+Encryption mismatch)",
        "security": "open",
        "channel_mode": "same",
        "clone_bssid": False,
    },
    "false_positive": {
        "label": "Test 2: False Positive Check (Matching WPA2, same channel)",
        "security": "wpa2",
        "channel_mode": "same",
        "clone_bssid": False,
    },
    "channel_variance": {
        "label": "Test 3: Channel Variance Only (Matching WPA2, different channel)",
        "security": "wpa2",
        "channel_mode": "different",
        "clone_bssid": False,
    },
    "bssid_clone_matching": {
        "label": "Test 4: BSSID Clone + Matching Security (WPA2, full MAC spoof)",
        "security": "wpa2",
        "channel_mode": "same",
        "clone_bssid": True,
    },
    "bssid_clone_open": {
        "label": "Test 5: BSSID Clone + Open Security (MAC spoof, encryption downgrade)",
        "security": "open",
        "channel_mode": "same",
        "clone_bssid": True,
    },
}

WPA2_PASSPHRASE = "testpassword123"


class EvilCorpApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Evil Corp")
        self.root.geometry("640x560")
        self.root.resizable(False, False)

        self.networks_raw: list[dict] = []
        self.attack_process: subprocess.Popen | None = None
        self.attack_thread: threading.Thread | None = None

        self.original_mac = _read_mac(INTERFACE)
        self.mac_spoofed = False
        self._clone_target_bssid: str | None = None

        self._build_ui()
        self.log(f"Using wireless interface: {INTERFACE}")
        if self.original_mac:
            self.log(f"Original MAC: {self.original_mac}")
        self.refresh_networks()

    # --- UI -----------------------------------------------------------

    def _build_ui(self) -> None:
        pad = {"padx": 10, "pady": 6}

        top = ttk.Frame(self.root)
        top.pack(fill="x", **pad)
        self.prepare_btn = ttk.Button(
            top, text="Prepare Attack Mode", command=self.prepare_attack_mode
        )
        self.prepare_btn.pack(side="left", padx=(0, 8))
        self.restore_btn = ttk.Button(
            top, text="Restore Networking", command=self.restore_networking
        )
        self.restore_btn.pack(side="left", padx=(0, 8))
        self.refresh_btn = ttk.Button(
            top, text="Refresh Networks", command=self.refresh_networks
        )
        self.refresh_btn.pack(side="left")

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
        self.scenario_bssid_var = tk.StringVar()
        ttk.Label(scenario_detail, text="Broadcast Security:").grid(row=0, column=0, sticky="w")
        ttk.Label(scenario_detail, textvariable=self.scenario_security_var).grid(row=0, column=1, sticky="w")
        ttk.Label(scenario_detail, text="Broadcast Channel:").grid(row=1, column=0, sticky="w")
        ttk.Label(scenario_detail, textvariable=self.scenario_channel_var).grid(row=1, column=1, sticky="w")
        ttk.Label(scenario_detail, text="BSSID:").grid(row=2, column=0, sticky="w")
        ttk.Label(scenario_detail, textvariable=self.scenario_bssid_var).grid(row=2, column=1, sticky="w")
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

    def _set_top_buttons_state(self, state: str) -> None:
        """Enable/disable Prepare/Restore/Refresh together, so overlapping
        clicks can't start a second airmon-ng/nmcli/systemctl call while
        one is still running in the background."""
        self.prepare_btn.configure(state=state)
        self.restore_btn.configure(state=state)
        self.refresh_btn.configure(state=state)

    # --- network / airmon control --------------------------------------

    def _require_interface(self) -> bool:
        """Check the interface we're about to run a command against still
        exists before running it, rather than finding out from a cryptic
        'No such device' failure partway through hostapd/airmon-ng.
        Returns False (and logs what to do) if it's missing."""
        if _interface_exists(INTERFACE):
            return True
        self.log(f"ERROR: wireless interface '{INTERFACE}' not found.")
        others = sorted(
            name for name in os.listdir("/sys/class/net")
            if os.path.isdir(os.path.join("/sys/class/net", name, "wireless"))
        )
        if others:
            self.log(
                f"Found these wireless interfaces instead: {', '.join(others)}. "
                f"Set EVIL_CORP_INTERFACE={others[0]} and restart Evil Corp, "
                f"or run 'ip link show' to check."
            )
        else:
            self.log(
                "No wireless interfaces detected at all. Check the adapter is "
                "plugged in / enabled, then run 'ip link show'."
            )
        messagebox.showerror(
            "Evil Corp", f"Wireless interface '{INTERFACE}' not found. See the Status log."
        )
        return False

    def prepare_attack_mode(self) -> None:
        """Free the wireless interface from NetworkManager/wpa_supplicant so
        hostapd can put it into AP (master) mode. This also stops this
        machine's own Wi-Fi scanning until Restore Networking is run.

        Runs in a background thread — airmon-ng can take several seconds,
        and running it directly on the Tkinter main thread froze the whole
        GUI (no repaint, no clicks) until it finished."""
        if not self._require_interface():
            return
        self.log("Preparing attack mode: killing NetworkManager/wpa_supplicant on the interface...")
        self._set_top_buttons_state("disabled")

        def worker() -> None:
            try:
                subprocess.run(
                    ["sudo", "airmon-ng", "check", "kill"],
                    check=True, capture_output=True, text=True,
                )
                self.root.after(
                    0, self.log,
                    "Interface freed. NetworkManager is stopped until you Restore Networking.",
                )
            except subprocess.CalledProcessError as e:
                self.root.after(0, self.log, f"Failed to prepare attack mode: {e.stderr or e}")
            except FileNotFoundError:
                self.root.after(0, self.log, "airmon-ng not found. Is aircrack-ng installed?")
            finally:
                self.root.after(0, self._set_top_buttons_state, "normal")

        threading.Thread(target=worker, daemon=True).start()

    def restore_networking(self) -> None:
        """Runs in a background thread for the same reason as
        prepare_attack_mode — systemctl can briefly block."""
        self.log("Restoring NetworkManager...")
        self._set_top_buttons_state("disabled")

        def worker() -> None:
            try:
                subprocess.run(
                    ["sudo", "systemctl", "start", "NetworkManager"],
                    check=True, capture_output=True, text=True,
                )
                self.root.after(0, self.log, "NetworkManager restored. Wi-Fi scanning available again.")
            except subprocess.CalledProcessError as e:
                self.root.after(0, self.log, f"Failed to restore networking: {e.stderr or e}")
            finally:
                self.root.after(0, self._set_top_buttons_state, "normal")

        threading.Thread(target=worker, daemon=True).start()

        # Safety net: if a BSSID-clone attack ended without going through
        # Stop Attack (e.g. hostapd crashed), don't leave this machine
        # broadcasting someone else's MAC address.
        if self.mac_spoofed:
            self._restore_mac_async()

    def refresh_networks(self) -> None:
        """Runs in a background thread — nmcli's --rescan yes can take
        several seconds and previously froze the GUI for that whole time."""
        self.log("Scanning for nearby networks...")
        self._set_top_buttons_state("disabled")

        def worker() -> None:
            try:
                result = subprocess.run(
                    [
                        "nmcli", "-t", "-f", "SSID,BSSID,CHAN,SECURITY",
                        "device", "wifi", "list", "--rescan", "yes",
                    ],
                    capture_output=True, text=True, encoding="utf-8", errors="ignore",
                )
            except FileNotFoundError:
                self.root.after(0, self.log, "nmcli not found. Is NetworkManager installed?")
                self.root.after(0, self._set_top_buttons_state, "normal")
                return
            self.root.after(0, self._apply_scan_results, result.stdout)
            self.root.after(0, self._set_top_buttons_state, "normal")

        threading.Thread(target=worker, daemon=True).start()

    def _apply_scan_results(self, stdout: str) -> None:
        """Runs on the main thread (via root.after) — safe to touch
        Tkinter widgets here, unlike inside the background worker."""
        self.networks_raw = []
        display_values = []
        for line in stdout.splitlines():
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
        self.apply_scenario_bssid()

    # --- scenario config -------------------------------------------------

    def on_scenario_change(self, event=None) -> None:
        key = self._current_scenario_key()
        scenario = SCENARIOS[key]
        self.scenario_security_var.set(scenario["security"].upper())
        self.apply_scenario_channel()
        self.apply_scenario_bssid()

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

    def apply_scenario_bssid(self) -> None:
        key = self._current_scenario_key()
        scenario = SCENARIOS[key]
        if not scenario.get("clone_bssid"):
            self.scenario_bssid_var.set(f"{INTERFACE}'s own MAC (no spoofing)")
            return
        idx = self.network_combo.current()
        if idx < 0 or idx >= len(self.networks_raw):
            self.scenario_bssid_var.set("(select a target network)")
            return
        target = self.networks_raw[idx]["bssid"]
        self.scenario_bssid_var.set(f"{target} (cloned from target)")

    def _current_scenario_key(self) -> str:
        idx = self.scenario_combo.current()
        return list(SCENARIOS.keys())[idx] if idx >= 0 else "evil_twin"

    # --- attack lifecycle -------------------------------------------------

    def launch_attack(self) -> None:
        if not self._require_interface():
            return

        idx = self.network_combo.current()
        if idx < 0 or idx >= len(self.networks_raw):
            messagebox.showwarning("Evil Corp", "Select a target network first.")
            return

        net = self.networks_raw[idx]
        key = self._current_scenario_key()
        scenario = SCENARIOS[key]
        channel = self.scenario_channel_var.get()

        self._clone_target_bssid = net["bssid"] if scenario.get("clone_bssid") else None

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
        if self._clone_target_bssid:
            self.log(f"BSSID clone requested: will spoof {INTERFACE} MAC to {self._clone_target_bssid}")
        self.log(f"Config written to {CONF_PATH}")

        self.launch_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.attack_thread = threading.Thread(target=self.run_hostapd, daemon=True)
        self.attack_thread.start()

    def _spoof_mac(self, target_bssid: str) -> bool:
        """Change this machine's wireless MAC to target_bssid, so hostapd
        broadcasts under that exact BSSID (and therefore OUI too). Must be
        called from a background thread, not the Tkinter main thread —
        each step shells out and can block briefly."""
        self.root.after(0, self.log, f"Cloning BSSID: spoofing {INTERFACE}'s MAC to {target_bssid}...")
        try:
            for args in (
                ["sudo", "ip", "link", "set", INTERFACE, "down"],
                ["sudo", "ip", "link", "set", INTERFACE, "address", target_bssid],
                ["sudo", "ip", "link", "set", INTERFACE, "up"],
            ):
                subprocess.run(args, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            self.root.after(0, self.log, f"Failed to spoof MAC: {e.stderr or e}")
            self.root.after(0, self.log, "Aborting attack launch.")
            return False
        except FileNotFoundError:
            self.root.after(0, self.log, "'ip' command not found. Is iproute2 installed?")
            return False
        self.mac_spoofed = True
        self.root.after(0, self.log, f"{INTERFACE} now broadcasting as {target_bssid}.")
        return True

    def _restore_mac_async(self) -> None:
        """Restore the interface's real MAC in the background. Safe to
        call even if nothing was spoofed (no-ops in that case)."""
        if not self.mac_spoofed or not self.original_mac:
            return

        def worker() -> None:
            self.root.after(0, self.log, f"Restoring original MAC ({self.original_mac}) on {INTERFACE}...")
            try:
                for args in (
                    ["sudo", "ip", "link", "set", INTERFACE, "down"],
                    ["sudo", "ip", "link", "set", INTERFACE, "address", self.original_mac],
                    ["sudo", "ip", "link", "set", INTERFACE, "up"],
                ):
                    subprocess.run(args, check=True, capture_output=True, text=True)
                self.mac_spoofed = False
                self.root.after(0, self.log, "Original MAC restored.")
            except subprocess.CalledProcessError as e:
                self.root.after(0, self.log, f"Failed to restore MAC: {e.stderr or e}")
            except FileNotFoundError:
                self.root.after(0, self.log, "'ip' command not found while restoring MAC.")

        threading.Thread(target=worker, daemon=True).start()

    def run_hostapd(self) -> None:
        try:
            if self._clone_target_bssid:
                if not self._spoof_mac(self._clone_target_bssid):
                    return
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
        self._restore_mac_async()

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

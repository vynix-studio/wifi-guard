# Evil Corp

A controlled Evil Twin attack simulator for testing WiFiGuard's detection
engine, run from a Kali Linux Live USB with a GUI instead of raw hostapd
commands typed by hand.

Picks a real nearby network from a dropdown, lets you choose a test
scenario, and launches/stops a cloned access point with `hostapd`.

## Scenarios

| # | Scenario | Security | Channel | BSSID | Tests |
|---|----------|----------|---------|-------|-------|
| 1 | Evil Twin | Open | Same as real AP | This machine's own MAC | The full attack: BSSID mismatch, OUI mismatch, signal anomaly, encryption downgrade all fire together |
| 2 | False Positive Check | WPA2 (matches real AP) | Same as real AP | This machine's own MAC | WiFiGuard should **not** flag this — confirms it doesn't false-positive on two legitimate APs sharing an SSID (mesh/roaming) |
| 3 | Channel Variance Only | WPA2 (matches real AP) | Different from real AP | This machine's own MAC | Isolates the channel-mismatch rule on its own |
| 4 | BSSID Clone + Matching Security | WPA2 (matches real AP) | Same as real AP | **Spoofed to the real AP's exact BSSID** | A true MAC clone — BSSID and OUI both match, channel and encryption both match. Nothing differs from the real AP's broadcast. Tests whether the detector has *any* signal left to catch this, or whether it's fully invisible |
| 5 | BSSID Clone + Open Security | Open | Same as real AP | **Spoofed to the real AP's exact BSSID** | Same MAC clone as #4, but encryption is downgraded to open — isolates the encryption-downgrade rule on its own, with BSSID/OUI/channel all otherwise matching |

Scenarios 4 and 5 spoof this machine's wireless MAC address (via
`ip link set <iface> address <bssid>`) to exactly match the target
network's BSSID before launching hostapd, then restore the original MAC
on **Stop Attack** (or **Restore Networking**, as a safety net if the
attack ends some other way). `setup.sh` configures the passwordless sudo
needed for this — see `sudoers_evil_corp.example`.

## One-time setup (on the Kali/Debian machine)

1. **Live USB persistence (if you're running from one).** Rufus's
   persistence slider is unreliable on some ISO/USB combinations. If
   `df -h` after boot shows the root filesystem entirely on
   `tmpfs`/`overlay`, create the persistence partition manually:
   ```bash
   sudo fdisk -l                      # identify the USB device (e.g. /dev/sdb) —
                                       # never touch the internal disk (/dev/sda)
   sudo fdisk /dev/sdb                 # n -> new partition in the free space -> w to write
   sudo mkfs.ext4 -L persistence /dev/sdbN
   sudo mkdir -p /mnt/p && sudo mount /dev/sdbN /mnt/p
   sudo cp persistence.conf /mnt/p/persistence.conf   # the file in this folder: "/ union"
   sudo umount /mnt/p
   ```
   Then select the "Live USB Persistence" boot option at startup. This step
   touches disk partitions, so it's the one thing `setup.sh` below does
   **not** automate — pick the wrong device here and you can wipe the wrong
   disk.

2. **Everything else: run `setup.sh`.**
   ```bash
   cd evil_corp
   ./setup.sh
   ```
   This installs `hostapd`, `network-manager` (for `nmcli`), `aircrack-ng`
   (for `airmon-ng`), `python3-tk`, `iw`, and a minimal X server +
   `openbox` (just enough to display the GUI, not a full desktop
   environment); sets up passwordless sudo for `hostapd` and for the
   specific `ip link set <iface> down/address/up` commands the BSSID-clone
   scenarios use to spoof/restore this machine's MAC (see
   `sudoers_evil_corp.example` for exactly what it writes); creates
   `~/wifiguard-tests`; configures
   console autologin on tty1 and auto-`startx` so the machine boots
   straight into the Evil Corp GUI with no login prompt or manual
   commands (see [`DISPLAY_SETUP.md`](DISPLAY_SETUP.md) for how this
   works and how to troubleshoot it); and checks your wireless adapter
   reports AP mode support. Every step first checks whether it's already
   done, so it's safe to re-run any time you pull new changes from this
   branch — it only applies what's missing or changed, and never
   re-installs or re-configures something already in place. Run it as
   your normal user, not with `sudo` (it calls `sudo` itself only for the
   steps that need root).

## Running

After `setup.sh`, the GUI launches automatically on boot — just power
the machine on and it's there, no commands needed. To launch it manually
instead (e.g. you're already logged in and it's not already running):

```bash
cd ~/wifiguard-tests   # or wherever you put this folder
python3 evil_corp.py   # run as your normal user, NOT with sudo
```

1. Click **Prepare Attack Mode** — this runs `airmon-ng check kill`, which
   frees the wireless interface for AP mode but also stops this machine's
   own Wi-Fi scanning until you click **Restore Networking**.
2. Pick the target network from the dropdown (its real channel/security
   auto-fill below it).
3. Pick a scenario.
4. **Launch Attack**. The generated hostapd config is written to
   `~/wifiguard-tests/generated_attack.conf` and the log pane streams
   hostapd's output live.
5. **Stop Attack** when done, then **Restore Networking** to get this
   machine's own Wi-Fi back.

## Known log lines

- `nl80211: Could not configure driver mode` — the interface is still held
  by NetworkManager/wpa_supplicant. Run **Prepare Attack Mode** first.
- `AP-STA-POSSIBLE-PSK-MISMATCH` after `AP-ENABLED` — not an error. A real
  nearby device auto-attempted to connect to the cloned SSID using its
  saved password for the real network. This is itself a live demonstration
  of the attack working: a client device trusting the SSID alone.
- `Cloning BSSID: spoofing <iface>'s MAC to <bssid>...` (Test 4/5 only) —
  expected, not an error. If it's followed by `Failed to spoof MAC`,
  double-check `setup.sh` ran successfully and wrote the `ip link set`
  sudoers rules (see `sudoers_evil_corp.example`).
- If Evil Corp is closed (or crashes) mid-attack during Test 4/5 without
  going through **Stop Attack**, this machine may still be broadcasting
  under the spoofed MAC. Click **Restore Networking** to restore the
  original MAC as a safety net, or check with `ip link show <iface>`.

# Evil Corp

A controlled Evil Twin attack simulator for testing WiFiGuard's detection
engine, run from a Kali Linux Live USB with a GUI instead of raw hostapd
commands typed by hand.

Picks a real nearby network from a dropdown, lets you choose a test
scenario, and launches/stops a cloned access point with `hostapd`.

## Scenarios

| # | Scenario | Security | Channel | Tests |
|---|----------|----------|---------|-------|
| 1 | Evil Twin | Open | Same as real AP | The full attack: BSSID mismatch, OUI mismatch, signal anomaly, encryption downgrade all fire together |
| 2 | False Positive Check | WPA2 (matches real AP) | Same as real AP | WiFiGuard should **not** flag this — confirms it doesn't false-positive on two legitimate APs sharing an SSID (mesh/roaming) |
| 3 | Channel Variance Only | WPA2 (matches real AP) | Different from real AP | Isolates the channel-mismatch rule on its own |

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
   (for `airmon-ng`) and `python3-tk`, sets up passwordless sudo for
   `hostapd` (see `sudoers_evil_corp.example` for exactly what it writes),
   creates `~/wifiguard-tests`, and checks your wireless adapter reports AP
   mode support. Every step first checks whether it's already done, so it's
   safe to re-run any time you pull new changes from this branch — it only
   applies what's missing or changed, and never re-installs or
   re-configures something already in place. Run it as your normal user,
   not with `sudo` (it calls `sudo` itself only for the steps that need
   root).

## Running

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

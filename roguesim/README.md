# RogueSim

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
needed for this — see `sudoers_roguesim.example`.

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
   cd roguesim
   ./setup.sh
   ```
   This installs `hostapd`, `network-manager` (for `nmcli`), `aircrack-ng`
   (for `airmon-ng`), `python3-tk`, `iw`, and a minimal X server +
   `openbox` (just enough to display the GUI, not a full desktop
   environment); sets up passwordless sudo for `hostapd`, for the
   specific `ip link set <iface> down/address/up` commands the BSSID-clone
   scenarios use to spoof/restore this machine's MAC, for
   `airmon-ng check kill` (**Prepare Attack Mode**), and for
   `systemctl start NetworkManager` (**Restore Networking**) — see
   `sudoers_roguesim.example` for exactly what it writes; creates
   `~/wifiguard-tests`; configures
   console autologin on tty1 and auto-`startx` so the machine boots
   straight into the RogueSim GUI with no login prompt or manual
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
python3 roguesim.py   # run as your normal user, NOT with sudo
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

## Updating RogueSim

This machine's own wireless adapter is busy running attacks (and is often
left with no real network association on purpose), so it isn't a usable
path for pulling updates. Instead, **Update RogueSim** uses a *separate*
wired or tethered connection:

1. Plug in an Ethernet cable, or connect a phone over USB with
   tethering/USB networking turned on (NetworkManager sees a USB-tethered
   phone as an ordinary "ethernet" device too — no special setup needed).
2. Click **Update RogueSim**.

Behind the scenes this runs `update.sh`, which finds and connects that
wired/tethered device via `nmcli`, waits for it to actually reach the
internet (not just link up), runs `git pull origin evil-corp`, and then
re-runs `setup.sh` to apply anything new (packages, sudoers rules, etc.).
Output streams into the Status log the same way an attack's does.

Because this runs unattended from a GUI button with no terminal attached,
`setup.sh`'s own internal `sudo` calls can't prompt for a password — you
have to provide one up front via an environment variable:

- **`ROGUESIM_SUDO_PASSWORD`** (required) — this machine's sudo password.
  Fed to `sudo` through a short-lived askpass helper that's deleted the
  moment `update.sh` exits; never written to a persistent file or put on
  a command line. The environment variable itself is only as safe as
  whatever sets it — e.g. adding `export ROGUESIM_SUDO_PASSWORD=...` to
  `~/.bash_profile` makes it readable by anyone with access to this
  account. That's an accepted trade-off on a dedicated, offline
  attack-simulation rig — don't do this on a machine that matters.
- `ROGUESIM_BRANCH` (optional, default `evil-corp`) — which branch to pull.
- `ROGUESIM_UPDATE_TIMEOUT_SECS` (optional, default `30`) — how long to
  wait for the wired/tethered connection to reach the internet before
  giving up.

This also assumes git credentials for
`https://github.com/vynix-studio/wifi-guard` are already set up on this
machine — `update.sh` only runs `git pull`, it doesn't configure
authentication for you.

If an attack is currently running, **Update RogueSim** refuses to start
(stop the attack first) — same safety convention as the other controls.

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
  sudoers rules (see `sudoers_roguesim.example`).
- If RogueSim is closed (or crashes) mid-attack during Test 4/5 without
  going through **Stop Attack**, this machine may still be broadcasting
  under the spoofed MAC. Click **Restore Networking** to restore the
  original MAC as a safety net, or check with `ip link show <iface>`.
- `Using 'ip'/'hostapd'/'airmon-ng'/'systemctl' binary: ...` on startup —
  informational, shows the exact absolute paths this run will `sudo`.
  If **any** sudo'd action ever hangs again — the GUI appears frozen on
  that one specific button, never on all of them at once, since each
  runs on its own background thread — it's almost always the same root
  cause: sudo resolves a *bare* command name through its own
  `secure_path`, which can disagree with this machine's normal `$PATH`
  (as a normal, non-root user) about where that binary lives or which of
  two equivalent paths comes first (e.g. `/usr/sbin/ip` is a symlink to
  `/usr/bin/ip` on Debian — same file, but sudo matches the literal
  resolved path against the sudoers rule, not the symlink target, so the
  two don't match each other even though they're the same binary). Every
  sudo'd call in `roguesim.py` (`ip`, `hostapd`, `airmon-ng`,
  `systemctl`) now always uses a resolved absolute path, never a bare
  command name, and `setup.sh` writes the matching sudoers rules with the
  same path preference — but if you ever see "a password is required"
  hang again, check `sudo -l` against the exact command and path logged
  above, and compare with `ls -la /usr/sbin/<cmd> /usr/bin/<cmd>`.

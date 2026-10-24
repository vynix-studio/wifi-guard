#!/usr/bin/env bash
# One-time machine setup for RogueSim, on a Debian/Kali-family Linux.
#
# Safe to re-run: every step checks whether it's already done before
# touching anything, so running this again after pulling new changes from
# this branch only applies what's missing/changed.
#
# What this script does NOT do (on purpose): partition the USB for
# persistence. That involves picking the right block device by hand
# (get it wrong and you can wipe the wrong disk), so it stays a manual,
# documented step in README.md.
#
# Usage:
#   cd roguesim
#   ./setup.sh
#
# Run as your normal user, NOT with sudo — the script calls sudo itself
# only for the specific commands that need root.
#
# Prompts for the username to auto-login as on tty1 (defaults to the
# current user). Set ROGUESIM_AUTOLOGIN_USER to skip the prompt, e.g.
# for a non-interactive run: ROGUESIM_AUTOLOGIN_USER=demo ./setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
WORK_DIR="${ROGUESIM_DIR:-$HOME/wifiguard-tests}"
SUDOERS_FILE="/etc/sudoers.d/roguesim"
LEGACY_SUDOERS_FILE="/etc/sudoers.d/evil-corp"  # pre-rename path; migrated below if present
SUDOERS_SRC="$SCRIPT_DIR/sudoers_roguesim.example"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
skip() { printf '\033[1;33m[skip]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; }

if [[ "${EUID}" -eq 0 ]]; then
  err "Don't run this as root/sudo — it needs your normal user's \$DISPLAY later to run RogueSim's GUI. It calls sudo itself for the specific steps that need it."
  exit 1
fi

# --- 1. OS sanity check -----------------------------------------------

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  case "${ID_LIKE:-$ID}" in
    *debian*) ok "Detected a Debian-family distro ($PRETTY_NAME)." ;;
    *) err "This targets Debian/Kali-family distros (apt-based). Detected: ${PRETTY_NAME:-unknown}. Install the packages below manually instead." ;;
  esac
else
  err "Could not read /etc/os-release — unknown distro, proceeding anyway."
fi

if ! command -v apt-get >/dev/null 2>&1; then
  err "apt-get not found. This script only supports Debian/Kali-family distros."
  exit 1
fi

# --- 2. Packages ---------------------------------------------------------
#
# Includes a minimal X server + window manager so roguesim.py's Tkinter
# GUI has something to display on at boot — not a full desktop environment
# (gnome/kde/xfce), just enough to run one app window.

REQUIRED_PACKAGES=(
  hostapd aircrack-ng network-manager python3-tk iw
  xserver-xorg xinit openbox
)

missing=()
for pkg in "${REQUIRED_PACKAGES[@]}"; do
  if dpkg -s "$pkg" >/dev/null 2>&1; then
    skip "$pkg already installed."
  else
    missing+=("$pkg")
  fi
done

if [[ ${#missing[@]} -eq 0 ]]; then
  ok "All required packages already installed."
else
  log "Installing missing packages: ${missing[*]}"
  sudo apt-get update
  sudo apt-get install -y "${missing[@]}"
  ok "Packages installed."
fi

# --- 3. Working directory -------------------------------------------------

if [[ -d "$WORK_DIR" ]]; then
  skip "Working directory already exists: $WORK_DIR"
else
  mkdir -p "$WORK_DIR"
  ok "Created working directory: $WORK_DIR"
fi

# --- 4. Passwordless sudo for hostapd, MAC spoofing, airmon-ng, systemctl --
#
# hostapd: launching the attack AP.
# ip link set ... down/address/up: the BSSID-clone scenarios spoof this
# machine's wireless MAC to match the target's BSSID, then restore it
# afterward. Scoped to just "set <any iface> down/address <any>/up", not
# broad ip access.
# airmon-ng check kill: Prepare Attack Mode frees the interface from
# NetworkManager/wpa_supplicant.
# systemctl start NetworkManager: Restore Networking gives this machine's
# own Wi-Fi back afterward.
#
# Every path below prefers a known canonical location outright (checked
# with -e) rather than trusting `command -v`'s PATH-search order: sudo
# resolves a bare command through its own secure_path, which can disagree
# with a normal (non-root) user's $PATH about where a binary lives — e.g.
# a normal user's PATH typically has no /usr/sbin at all, while sudo's
# secure_path does, and even where both exist (/usr/sbin/ip is a symlink
# to /usr/bin/ip on Debian) sudo matches the literal resolved path
# against the sudoers rule, not the realpath. If this script picked
# whichever path happened to resolve first here, roguesim.py's `sudo
# <cmd> ...` calls could silently resolve to a different path at runtime
# and fail to match the rule written below — which is exactly the bug
# that caused Test 4/5's MAC spoof, then Prepare Attack Mode/Restore
# Networking, to hang waiting on a password prompt with no TTY to answer
# it. roguesim.py's own _resolve_absolute_path() uses this same
# "canonical path first" preference, so the two always agree.
resolve_path() {
  local preferred="$1" command="$2"
  if [[ -e "$preferred" ]]; then
    echo "$preferred"
  else
    command -v "$command" || echo "$preferred"
  fi
}

HOSTAPD_PATH="$(resolve_path /usr/sbin/hostapd hostapd)"
IP_PATH="$(resolve_path /usr/bin/ip ip)"
AIRMON_PATH="$(resolve_path /usr/sbin/airmon-ng airmon-ng)"
SYSTEMCTL_PATH="$(resolve_path /usr/bin/systemctl systemctl)"
SUDO_RULE_USER="$(whoami)"
DESIRED_SUDOERS_CONTENT="${SUDO_RULE_USER} ALL=(ALL) NOPASSWD: ${HOSTAPD_PATH}
${SUDO_RULE_USER} ALL=(ALL) NOPASSWD: ${IP_PATH} link set * down
${SUDO_RULE_USER} ALL=(ALL) NOPASSWD: ${IP_PATH} link set * address *
${SUDO_RULE_USER} ALL=(ALL) NOPASSWD: ${IP_PATH} link set * up
${SUDO_RULE_USER} ALL=(ALL) NOPASSWD: ${AIRMON_PATH} check kill
${SUDO_RULE_USER} ALL=(ALL) NOPASSWD: ${SYSTEMCTL_PATH} start NetworkManager"

# sudo diff with process substitution (<(...)) is unreliable here — the
# /dev/fd/N the shell hands diff doesn't always survive the exec into
# sudo's child process. Write the desired content to a real temp file and
# diff two plain files instead.
TMP_SUDOERS="$(mktemp)"
echo "$DESIRED_SUDOERS_CONTENT" > "$TMP_SUDOERS"

# One-time migration: this project was renamed from "Evil Corp" to
# "RogueSim", and the sudoers file it installs was renamed to match. A
# machine set up before the rename has the rule at the old path; remove it
# once we're about to write the new one, so a leftover stale file doesn't
# sit in /etc/sudoers.d/ alongside the new one.
if [[ -f "$LEGACY_SUDOERS_FILE" ]]; then
  log "Found sudoers rule at the pre-rename path ($LEGACY_SUDOERS_FILE); migrating to $SUDOERS_FILE..."
  sudo rm -f "$LEGACY_SUDOERS_FILE"
fi

if [[ -f "$SUDOERS_FILE" ]] && sudo diff -q "$TMP_SUDOERS" "$SUDOERS_FILE" >/dev/null 2>&1; then
  skip "Passwordless sudo for hostapd/MAC spoofing/airmon-ng/systemctl already configured ($SUDOERS_FILE)."
  rm -f "$TMP_SUDOERS"
else
  log "Configuring passwordless sudo for hostapd ($HOSTAPD_PATH), interface MAC changes ($IP_PATH), airmon-ng ($AIRMON_PATH), and NetworkManager ($SYSTEMCTL_PATH)..."
  if sudo visudo -c -f "$TMP_SUDOERS" >/dev/null 2>&1; then
    sudo install -m 0440 "$TMP_SUDOERS" "$SUDOERS_FILE"
    ok "Wrote $SUDOERS_FILE."
  else
    err "Generated sudoers rule failed validation — not installed. See $SUDOERS_SRC and add it with 'sudo visudo -f $SUDOERS_FILE' yourself."
  fi
  rm -f "$TMP_SUDOERS"
fi

# --- 5. Wireless AP-mode capability check (informational only) -----------

IFACE="${ROGUESIM_INTERFACE:-wlan0}"
if command -v iw >/dev/null 2>&1 && iw phy >/dev/null 2>&1; then
  if iw list 2>/dev/null | grep -A10 "Supported interface modes" | grep -q "\* AP$"; then
    ok "Wireless adapter reports AP mode support."
  else
    err "Could not confirm AP mode support for your wireless adapter — launching an attack may fail with 'Could not configure driver mode'. Check 'iw list' output under 'Supported interface modes'."
  fi
else
  skip "iw not available — skipping AP-mode capability check."
fi

# --- 6. Console autologin on tty1 ----------------------------------------
#
# Lets the machine boot straight to a shell with no login prompt, so it
# can run headless and still reach the GUI without a keyboard/monitor
# dance each time.

GETTY_OVERRIDE_DIR="/etc/systemd/system/getty@tty1.service.d"
GETTY_OVERRIDE_FILE="$GETTY_OVERRIDE_DIR/autologin.conf"

if [[ -n "${ROGUESIM_AUTOLOGIN_USER:-}" ]]; then
  AUTOLOGIN_USER="$ROGUESIM_AUTOLOGIN_USER"
  log "Using autologin user from \$ROGUESIM_AUTOLOGIN_USER: $AUTOLOGIN_USER"
elif [[ -t 0 ]]; then
  read -rp "Username to auto-login as on tty1 [$(whoami)]: " AUTOLOGIN_USER
  AUTOLOGIN_USER="${AUTOLOGIN_USER:-$(whoami)}"
else
  AUTOLOGIN_USER="$(whoami)"
  skip "Non-interactive shell — defaulting autologin user to $AUTOLOGIN_USER (set \$ROGUESIM_AUTOLOGIN_USER to override)."
fi

if ! id "$AUTOLOGIN_USER" >/dev/null 2>&1; then
  err "User '$AUTOLOGIN_USER' does not exist on this system. Skipping autologin setup — re-run ./setup.sh with a valid username."
  AUTOLOGIN_USER=""
fi

if [[ -n "$AUTOLOGIN_USER" ]]; then
DESIRED_GETTY_CONTENT="[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${AUTOLOGIN_USER} --noclear %I \$TERM"

if [[ -f "$GETTY_OVERRIDE_FILE" ]] && diff -q <(echo "$DESIRED_GETTY_CONTENT") "$GETTY_OVERRIDE_FILE" >/dev/null 2>&1; then
  skip "Console autologin for tty1 already configured for $AUTOLOGIN_USER."
else
  log "Configuring console autologin on tty1 for $AUTOLOGIN_USER..."
  sudo mkdir -p "$GETTY_OVERRIDE_DIR"
  TMP_GETTY="$(mktemp)"
  echo "$DESIRED_GETTY_CONTENT" > "$TMP_GETTY"
  sudo install -m 0644 "$TMP_GETTY" "$GETTY_OVERRIDE_FILE"
  rm -f "$TMP_GETTY"
  sudo systemctl daemon-reload
  sudo systemctl restart getty@tty1.service
  ok "Wrote $GETTY_OVERRIDE_FILE and reloaded tty1."
fi
fi  # AUTOLOGIN_USER non-empty

# --- 7. Auto-start X on tty1 login ----------------------------------------

BASH_PROFILE="$HOME/.bash_profile"
STARTX_SNIPPET='if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  startx
fi'

if [[ -f "$BASH_PROFILE" ]] && grep -qF 'startx' "$BASH_PROFILE" 2>/dev/null; then
  skip "Auto-startx on tty1 login already configured in $BASH_PROFILE."
else
  log "Adding auto-startx on tty1 login to $BASH_PROFILE..."
  printf '\n%s\n' "$STARTX_SNIPPET" >> "$BASH_PROFILE"
  ok "Updated $BASH_PROFILE."
fi

# --- 8. Point startx at the RogueSim GUI ---------------------------------

XINITRC="$HOME/.xinitrc"
DESIRED_XINITRC="openbox &
exec python3 $SCRIPT_DIR/roguesim.py"

if [[ -f "$XINITRC" ]] && diff -q <(echo "$DESIRED_XINITRC") "$XINITRC" >/dev/null 2>&1; then
  skip "$XINITRC already launches RogueSim."
else
  log "Writing $XINITRC to launch RogueSim on startx..."
  echo "$DESIRED_XINITRC" > "$XINITRC"
  ok "Wrote $XINITRC."
fi

# --- 9. Persistence reminder --------------------------------------------

if [[ -f /run/live/medium/persistence.conf ]] || [[ -f /persistence.conf ]]; then
  skip "A persistence.conf is already present on this system."
else
  log "No persistence.conf detected. If you're on a Live USB and want changes to survive a reboot, follow the manual partitioning steps in README.md (this script does not touch disk partitions)."
fi

echo
ok "Setup complete. The machine will boot straight into the RogueSim GUI"
ok "(console autologin -> startx -> roguesim.py). Reboot to test:"
echo "  sudo reboot"
echo
echo "Or run it right now without rebooting:"
echo "  cd $WORK_DIR && python3 $SCRIPT_DIR/roguesim.py"

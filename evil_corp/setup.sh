#!/usr/bin/env bash
# One-time machine setup for Evil Corp, on a Debian/Kali-family Linux.
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
#   cd evil_corp
#   ./setup.sh
#
# Run as your normal user, NOT with sudo — the script calls sudo itself
# only for the specific commands that need root.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
WORK_DIR="${EVIL_CORP_DIR:-$HOME/wifiguard-tests}"
SUDOERS_FILE="/etc/sudoers.d/evil-corp"
SUDOERS_SRC="$SCRIPT_DIR/sudoers_evil_corp.example"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
skip() { printf '\033[1;33m[skip]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; }

if [[ "${EUID}" -eq 0 ]]; then
  err "Don't run this as root/sudo — it needs your normal user's \$DISPLAY later to run Evil Corp's GUI. It calls sudo itself for the specific steps that need it."
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
# Includes a minimal X server + window manager so evil_corp.py's Tkinter
# GUI has something to display on at boot — not a full desktop environment
# (gnome/kde/xfce), just enough to run one app window.

REQUIRED_PACKAGES=(
  hostapd aircrack-ng network-manager python3-tk
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

# --- 4. Passwordless sudo for hostapd --------------------------------

HOSTAPD_PATH="$(command -v hostapd || echo /usr/sbin/hostapd)"
DESIRED_RULE="$(whoami) ALL=(ALL) NOPASSWD: ${HOSTAPD_PATH}"

if [[ -f "$SUDOERS_FILE" ]] && sudo grep -qxF "$DESIRED_RULE" "$SUDOERS_FILE" 2>/dev/null; then
  skip "Passwordless sudo for hostapd already configured ($SUDOERS_FILE)."
else
  log "Configuring passwordless sudo for hostapd at $HOSTAPD_PATH..."
  TMP_SUDOERS="$(mktemp)"
  echo "$DESIRED_RULE" > "$TMP_SUDOERS"
  if sudo visudo -c -f "$TMP_SUDOERS" >/dev/null 2>&1; then
    sudo install -m 0440 "$TMP_SUDOERS" "$SUDOERS_FILE"
    ok "Wrote $SUDOERS_FILE."
  else
    err "Generated sudoers rule failed validation — not installed. See $SUDOERS_SRC and add it with 'sudo visudo -f $SUDOERS_FILE' yourself."
  fi
  rm -f "$TMP_SUDOERS"
fi

# --- 5. Wireless AP-mode capability check (informational only) -----------

IFACE="${EVIL_CORP_INTERFACE:-wlan0}"
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
CURRENT_USER="$(whoami)"
DESIRED_GETTY_CONTENT="[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin ${CURRENT_USER} --noclear %I \$TERM"

if [[ -f "$GETTY_OVERRIDE_FILE" ]] && diff -q <(echo "$DESIRED_GETTY_CONTENT") "$GETTY_OVERRIDE_FILE" >/dev/null 2>&1; then
  skip "Console autologin for tty1 already configured for $CURRENT_USER."
else
  log "Configuring console autologin on tty1 for $CURRENT_USER..."
  sudo mkdir -p "$GETTY_OVERRIDE_DIR"
  TMP_GETTY="$(mktemp)"
  echo "$DESIRED_GETTY_CONTENT" > "$TMP_GETTY"
  sudo install -m 0644 "$TMP_GETTY" "$GETTY_OVERRIDE_FILE"
  rm -f "$TMP_GETTY"
  sudo systemctl daemon-reload
  sudo systemctl restart getty@tty1.service
  ok "Wrote $GETTY_OVERRIDE_FILE and reloaded tty1."
fi

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

# --- 8. Point startx at the Evil Corp GUI ---------------------------------

XINITRC="$HOME/.xinitrc"
DESIRED_XINITRC="openbox &
exec python3 $SCRIPT_DIR/evil_corp.py"

if [[ -f "$XINITRC" ]] && diff -q <(echo "$DESIRED_XINITRC") "$XINITRC" >/dev/null 2>&1; then
  skip "$XINITRC already launches Evil Corp."
else
  log "Writing $XINITRC to launch Evil Corp on startx..."
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
ok "Setup complete. The machine will boot straight into the Evil Corp GUI"
ok "(console autologin -> startx -> evil_corp.py). Reboot to test:"
echo "  sudo reboot"
echo
echo "Or run it right now without rebooting:"
echo "  cd $WORK_DIR && python3 $SCRIPT_DIR/evil_corp.py"

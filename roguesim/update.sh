#!/usr/bin/env bash
# Pulls the latest RogueSim changes over a wired/USB-tethered connection
# and re-applies them with setup.sh. Triggered from RogueSim's "Update
# RogueSim" button (see roguesim.py's update_roguesim()), or run directly:
#   ROGUESIM_SUDO_PASSWORD=... ./update.sh
#
# Why a SEPARATE connection at all: this machine's own Wi-Fi adapter is
# (a) the device RogueSim puts into AP mode for attacks, and (b) often
# left with no real network association on purpose, so it isn't a usable
# internet path for pulling an update. Plug in a wired Ethernet cable, or
# tether a phone over USB with tethering/USB networking turned on (Linux
# and NetworkManager present a USB-tethered phone as an ordinary
# "ethernet" device too, so it needs no special-casing below) — THEN
# trigger this.
#
# This has to run fully unattended (triggered from a GUI button, no one
# sitting at a terminal to answer prompts), which means two things it
# needs that a normal interactive run of setup.sh doesn't:
#
#   ROGUESIM_SUDO_PASSWORD — this machine's sudo password. setup.sh calls
#       sudo itself for several steps (apt-get, installing the sudoers
#       rule, the autologin config), and with no terminal attached here
#       those calls would otherwise hang forever waiting for input nobody
#       can give them. This script feeds the password to sudo through a
#       short-lived askpass helper (never on a command line, never
#       written to a persistent file — see Step 5 below) rather than
#       putting it anywhere sudo's own prompt-on-tty path would use.
#       Treat this env var itself with the same care as the password:
#       whatever sets it (e.g. ~/.bash_profile on this test machine, per
#       setup.sh's autostart config) is readable by anyone with access to
#       this account, which is an accepted trade-off on a dedicated,
#       offline attack-simulation rig, not something to replicate on a
#       machine that matters.
#
#   Working git credentials already configured on this machine for
#       https://github.com/vynix-studio/wifi-guard. This script only
#       runs `git pull`; it doesn't set up authentication for you.
#
# Optional overrides:
#   ROGUESIM_BRANCH               (default: evil-corp)
#   ROGUESIM_UPDATE_TIMEOUT_SECS  (default: 30) — how long to wait for the
#                                  wired/tethered connection to actually
#                                  reach the internet before giving up.

set -uo pipefail
# Deliberately NOT -e: every step below checks its own exit status and
# reports a specific, actionable error, rather than the script just
# dying silently mid-way on whichever line happened to fail.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
BRANCH="${ROGUESIM_BRANCH:-evil-corp}"
TIMEOUT="${ROGUESIM_UPDATE_TIMEOUT_SECS:-30}"

log()  { printf '\033[1;34m[update]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ ok ]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; }

if [[ "${EUID}" -eq 0 ]]; then
  err "Don't run this as root/sudo — same reason as setup.sh. It escalates itself only for the specific steps that need it."
  exit 1
fi

if [[ -z "${ROGUESIM_SUDO_PASSWORD:-}" ]]; then
  err "ROGUESIM_SUDO_PASSWORD is not set. setup.sh needs sudo for several steps and there's no terminal here to prompt for it, so without this it will hang or fail partway through. Set it and re-run."
  exit 1
fi

# --- 1. Make sure NetworkManager is even running -------------------------
# "Prepare Attack Mode" (airmon-ng check kill) stops NetworkManager
# system-wide, not just for the wireless interface — if that's still in
# effect, nmcli below has nothing to work with at all.
if ! systemctl is-active --quiet NetworkManager; then
  log "NetworkManager is stopped (still in Prepare Attack Mode?). Starting it..."
  if ! sudo -n systemctl start NetworkManager 2>/dev/null; then
    err "Could not start NetworkManager without a password prompt. Click Restore Networking in RogueSim first, then retry Update."
    exit 1
  fi
  sleep 2
fi

# --- 2. Find a wired/USB-tethered device and connect it -------------------
log "Looking for a wired or USB-tethered network device..."
WIRED_DEV=""
WIRED_STATE=""
while IFS=: read -r dev type state; do
  if [[ "$type" == "ethernet" ]]; then
    WIRED_DEV="$dev"
    WIRED_STATE="$state"
    break
  fi
done < <(nmcli -t -f DEVICE,TYPE,STATE device status)

if [[ -z "$WIRED_DEV" ]]; then
  err "No wired/USB-tethered device found. Plug in an Ethernet cable, or connect a phone via USB with tethering/USB networking turned on, then retry."
  exit 1
fi
log "Found wired device: $WIRED_DEV (state: $WIRED_STATE)"

if [[ "$WIRED_STATE" != "connected" ]]; then
  log "Connecting $WIRED_DEV..."
  NMCLI_LOG="$(mktemp)"
  if ! nmcli device connect "$WIRED_DEV" >"$NMCLI_LOG" 2>&1; then
    err "Failed to connect $WIRED_DEV:"
    cat "$NMCLI_LOG" >&2
    rm -f "$NMCLI_LOG"
    exit 1
  fi
  rm -f "$NMCLI_LOG"
fi

# --- 3. Wait for actual internet reachability, not just link state --------
log "Waiting for connectivity (up to ${TIMEOUT}s)..."
CONNECTED=0
for ((elapsed = 0; elapsed < TIMEOUT; elapsed += 2)); do
  if ping -c1 -W2 github.com >/dev/null 2>&1; then
    CONNECTED=1
    break
  fi
  sleep 2
done
if [[ "$CONNECTED" -ne 1 ]]; then
  err "Connected to $WIRED_DEV but couldn't reach github.com within ${TIMEOUT}s. Check the cable/tether actually has internet access (not just a link), then retry."
  exit 1
fi
ok "Connectivity confirmed via $WIRED_DEV."

# --- 4. Authenticate sudo up front, so a wrong password fails fast and --
#        clearly here rather than confusingly deep inside setup.sh.
log "Checking the supplied sudo password..."
SUDO_CHECK_LOG="$(mktemp)"
if ! printf '%s\n' "$ROGUESIM_SUDO_PASSWORD" | sudo -S -v 2>"$SUDO_CHECK_LOG"; then
  err "Could not authenticate with the supplied ROGUESIM_SUDO_PASSWORD:"
  cat "$SUDO_CHECK_LOG" >&2
  rm -f "$SUDO_CHECK_LOG"
  exit 1
fi
rm -f "$SUDO_CHECK_LOG"
ok "Sudo authenticated."

# --- 5. Pull the latest RogueSim changes -----------------------------------
log "Pulling latest changes from origin/$BRANCH..."
if ! git -C "$SCRIPT_DIR" pull origin "$BRANCH"; then
  err "git pull failed. If this machine has never authenticated to GitHub before, set that up manually first (see README.md), then retry."
  exit 1
fi
ok "Repository updated."

# --- 6. Re-run setup.sh, feeding it the sudo password via askpass ----------
# Never put the password on a command line (visible to anyone via `ps`) or
# write it to a persistent file — a short-lived askpass helper script,
# deleted immediately after this script exits, is the standard pattern for
# unattended sudo. sudo automatically uses $SUDO_ASKPASS when no terminal
# is attached (exactly the case here, launched from a GUI button with no
# tty), so setup.sh itself needs no changes or awareness of any of this.
ASKPASS="$(mktemp)"
trap 'rm -f "$ASKPASS"' EXIT
cat > "$ASKPASS" <<'ASKPASS_EOF'
#!/bin/sh
printf '%s' "$ROGUESIM_SUDO_PASSWORD"
ASKPASS_EOF
chmod 700 "$ASKPASS"

log "Re-running setup.sh to apply anything new (packages, passwordless sudo rules)..."
export SUDO_ASKPASS="$ASKPASS"
export ROGUESIM_AUTOLOGIN_USER="${ROGUESIM_AUTOLOGIN_USER:-$(whoami)}"
if ! "$SCRIPT_DIR/setup.sh" < /dev/null; then
  err "setup.sh failed — see the output above for which step."
  exit 1
fi

ok "RogueSim is up to date."

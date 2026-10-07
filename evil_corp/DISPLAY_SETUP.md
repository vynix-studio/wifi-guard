# Headless-to-GUI setup: auto-boot straight into Evil Corp

Optional, one-time, **manual** setup for running the machine headless
(keyboard only, no monitor interaction needed) but still getting the
Tkinter GUI to appear automatically on boot — no login prompt, no typing
`startx` or `python3 evil_corp.py` by hand each time.

This is deliberately **not** part of `setup.sh`. It changes how the whole
machine boots and logs in, which is a one-time decision for a dedicated
test box, not something that should silently happen on every
`git pull && ./setup.sh`. If you don't want this, skip this file entirely
— `setup.sh` plus running `python3 evil_corp.py` by hand still works fine.

## 1. Install a minimal X server + window manager

```bash
sudo apt update
sudo apt install --no-install-recommends -y xserver-xorg xinit openbox
```

`--no-install-recommends` keeps this to just enough to display one window
— no full desktop environment (GNOME/KDE/XFCE).

## 2. Console autologin on tty1

```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf > /dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin YOURUSERNAME --noclear %I $TERM
EOF
sudo systemctl daemon-reload
sudo systemctl restart getty@tty1.service
```

Replace `YOURUSERNAME` with your actual login username (check with
`whoami`).

**Gotcha:** the `[Service]` section header is case-sensitive. If you see
this in `journalctl -u getty@tty1.service`:

```
Unknown section 'service'. Ignoring.
```

your file has `[service]` (lowercase) instead of `[Service]` — fix the
capitalization and re-run the `daemon-reload`/`restart` above.

Verify the override actually merged in:

```bash
systemctl cat getty@tty1.service
```

You should see your override block appended at the bottom, after the
default unit content.

## 3. Auto-start X on login

```bash
cat >> ~/.bash_profile <<'EOF'
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  startx
fi
EOF
```

Only fires on tty1 (where autologin happens), so it won't try to start a
second X session if you SSH in separately.

## 4. Point `startx` straight at the GUI

By default `startx` runs whatever's in `~/.xinitrc`. Launch
`evil_corp.py` directly as X's only client — closing the GUI window ends
the X session and drops you back to the tty:

```bash
cat > ~/.xinitrc <<'EOF'
exec python3 ~/wifiguard-tests/evil_corp/evil_corp.py
EOF
```

(adjust the path if you cloned this repo somewhere other than
`~/wifiguard-tests`)

This skips window-manager chrome (no title bar drag/resize) since
nothing but the Tkinter app is running. If you'd rather keep basic window
management, start `openbox` in the background first:

```bash
cat > ~/.xinitrc <<'EOF'
openbox &
exec python3 ~/wifiguard-tests/evil_corp/evil_corp.py
EOF
```

## Result

Power on → boots → autologs in on tty1 → `startx` fires from
`.bash_profile` → X launches `evil_corp.py` as its sole client. No
keyboard interaction needed before the GUI is on screen.

## Testing without a full reboot

After editing any of the systemd/bash_profile/xinitrc pieces above, you
can test the getty/autologin part alone with:

```bash
sudo systemctl restart getty@tty1.service
```

then switch to tty1 with `Ctrl+Alt+F1`. For the X/`.xinitrc` part, just
log out and log back in, or run `startx` by hand once to confirm
`evil_corp.py` launches before relying on the automatic path.

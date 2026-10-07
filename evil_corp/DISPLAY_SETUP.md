# Headless-to-GUI boot: how it works

`setup.sh` configures the machine to boot straight into the Evil Corp GUI
— no monitor/keyboard interaction needed, no login prompt, no typing
`startx` or `python3 evil_corp.py` by hand. This file documents what it
sets up and how to troubleshoot it; you don't need to run anything here
manually — `./setup.sh` does it, idempotently, like everything else it
configures.

## What `setup.sh` sets up

1. **Minimal X server + window manager** — `xserver-xorg`, `xinit`,
   `openbox` (just enough to display one window, not a full desktop
   environment).
2. **Console autologin on tty1** — `/etc/systemd/system/getty@tty1.service.d/autologin.conf`,
   so the machine drops straight into a shell as you, no login prompt.
   `setup.sh` prompts for which username to auto-login as (default: the
   user running the script). Set `EVIL_CORP_AUTOLOGIN_USER=someuser` to
   skip the prompt, e.g. for a non-interactive/scripted run.
3. **Auto-`startx` on tty1 login** — appended to `~/.bash_profile`, only
   fires on tty1 so it won't interfere with SSH sessions.
4. **`~/.xinitrc`** launching `openbox &` then `evil_corp.py` as X's sole
   client — closing the GUI window ends the X session and drops back to
   the tty.

Power on → boots → autologs in on tty1 → `startx` fires from
`.bash_profile` → X launches `evil_corp.py`. No keyboard interaction
needed before the GUI is on screen.

Re-running `./setup.sh` after a `git pull` checks all of this and only
touches what's missing or changed — same as the rest of the script.

## Troubleshooting

**Still asked for a password at boot / no autologin:**

```bash
systemctl cat getty@tty1.service
```

Check your override block is appended at the bottom, under
`# /etc/systemd/system/getty@tty1.service.d/autologin.conf`. If it's
missing, re-run `./setup.sh`.

**`journalctl -u getty@tty1.service` shows:**

```
Unknown section 'service'. Ignoring.
```

The `[Service]` section header is case-sensitive — if this ever happens
from a manual edit, it means something wrote `[service]` (lowercase).
`setup.sh` always writes it correctly, so this should only come up if the
file was hand-edited afterward. Fix the capitalization, then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart getty@tty1.service
```

**Testing without a full reboot** — restart the getty service and switch
tty directly instead of rebooting each time:

```bash
sudo systemctl restart getty@tty1.service
```

then `Ctrl+Alt+F1` to switch to tty1. For the X/`.xinitrc` part, log out
and back in, or run `startx` by hand once to confirm `evil_corp.py`
launches.

**`-bash: [-z: command not found` on login** — a broken `~/.bash_profile`
(missing space after `[`, e.g. `[-z` instead of `[ -z`). Check with
`cat ~/.bash_profile`; if `setup.sh` wrote it, this shouldn't happen, but
if you'd hand-edited it before, remove the broken block and re-run
`./setup.sh`.

## Opting out

If you don't want the machine to boot straight into the GUI (e.g. you
want a normal login prompt), just don't run the autologin/X pieces —
there's currently no flag to skip them individually, so remove the
generated files afterward if needed:

```bash
sudo rm -f /etc/systemd/system/getty@tty1.service.d/autologin.conf
sudo systemctl daemon-reload
# then manually remove the startx block from ~/.bash_profile
```

`setup.sh` will recreate them again on your next run — that's the
trade-off for being idempotent, so only do this if you really want
default Debian login behavior back.

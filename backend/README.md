# WiFiGuard backend

Cross-platform Wi-Fi scanning, rule-based Evil Twin / rogue AP detection,
and a JSON API + SocketIO feed for the React frontend in this repo.

## Setup

```bash
cd backend
uv sync
uv run python app.py
```

The API listens on `http://localhost:5000`. The React UI in the repo root
(`pnpm install && pnpm dev`) connects to it automatically; set
`VITE_API_BASE_URL` if the backend runs elsewhere.

## Layout

- `wifiguard/scanner/` — OS-native Wi-Fi scanning (`netsh` on Windows,
  `nmcli` on Linux). No third-party Wi-Fi library is used.
- `wifiguard/detection/engine.py` — weighted rule-based scoring for
  BSSID mismatch, vendor OUI mismatch, channel mismatch, signal anomaly,
  and encryption downgrade.
- `wifiguard/storage/db.py` — SQLite storage for trusted APs, the alert
  log, and user-configurable settings.
- `app.py` — Flask app exposing the JSON API and a SocketIO `update`
  event emitted after every scan cycle.

## API

| Method | Path                  | Purpose                              |
|--------|-----------------------|---------------------------------------|
| GET    | `/api/health`         | Liveness check                        |
| GET    | `/api/networks`       | Latest scan results with verdicts     |
| GET    | `/api/trusted`        | List trusted APs                      |
| POST   | `/api/trusted`        | Add a trusted AP `{ssid, bssid}`      |
| DELETE | `/api/trusted`        | Remove a trusted AP `{ssid, bssid}`   |
| GET    | `/api/alerts`         | Recent alert log                      |
| DELETE | `/api/alerts`         | Clear the alert log                   |
| GET/POST | `/api/scan`         | Scanning state / pause or resume `{scanning}` |
| GET    | `/api/alerts/export`  | Alert log as CSV                      |
| GET    | `/api/settings`       | Current settings                      |
| POST   | `/api/settings`       | Update settings                       |

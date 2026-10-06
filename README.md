# WiFiGuard

A detection and alerting tool for rogue access points and Evil Twin attacks
in public spaces. Scans nearby Wi-Fi networks, scores them against a
rule-based Evil Twin / rogue AP detection engine, and surfaces live results,
alerts, and trusted-network management through a web dashboard.

- `backend/` — Python/Flask backend: cross-platform Wi-Fi scanning,
  detection engine, SQLite storage, JSON API + SocketIO live updates. See
  `backend/README.md`.
- `src/` — React + TypeScript + Tailwind dashboard (Vite). Live Monitor,
  Alerts, Trusted APs, and Settings, connected to the backend over the API.

## Running locally

```bash
# Terminal 1 — backend
cd backend
uv sync
uv run python app.py        # http://localhost:5000

# Terminal 2 — frontend
pnpm install
pnpm dev                    # http://localhost:5173
```

The frontend expects the backend at `http://localhost:5000` by default;
override with `VITE_API_BASE_URL` if it runs elsewhere.

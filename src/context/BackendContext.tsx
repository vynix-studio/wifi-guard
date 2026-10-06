import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io } from 'socket.io-client';
import {
  API_BASE_URL,
  api,
  type AlertEntry,
  type ScanState,
  type Settings,
  type TrustedAp,
} from '../lib/api';
import { percentToDbm, toNetwork } from '../lib/adapt';
import type { Network, Observation } from '../data/types';

interface BackendContextValue {
  networks: Network[];
  lastScanAt: string | null;
  scanning: boolean;
  /** True while the SocketIO link to the Flask backend is up. */
  connected: boolean;
  trusted: TrustedAp[];
  settings: Settings | null;
  alerts: AlertEntry[];
  refreshAlerts: () => void;
  trustNetwork: (ssid: string, bssid: string) => Promise<void>;
  untrustNetwork: (ssid: string, bssid: string) => Promise<void>;
  toggleScanning: () => Promise<void>;
  saveSettings: (next: Settings) => Promise<void>;
  clearAlerts: () => Promise<void>;
}

const BackendContext = createContext<BackendContextValue | null>(null);

const MAX_OBSERVATIONS = 15;

interface History {
  signal: number;
  channel: number;
  observations: Observation[];
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const [scan, setScan] = useState<ScanState>({
    networks: [],
    last_scan: null,
    last_scan_at: null,
    scanning: true,
  });
  const [connected, setConnected] = useState(false);
  const [trusted, setTrusted] = useState<TrustedAp[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const historyRef = useRef<Map<string, History>>(new Map());

  // Fold each incoming scan into a per-network activity log (newest first),
  // so the inspector's "Recent Activity" reflects real changes between scans.
  const applyScan = useCallback((data: ScanState) => {
    const time = data.last_scan ?? '';
    for (const n of data.networks) {
      const dbm = percentToDbm(n.signal);
      const prev = historyRef.current.get(n.bssid);
      if (!prev) {
        historyRef.current.set(n.bssid, {
          signal: dbm,
          channel: n.channel,
          observations: [
            { timestamp: time, event: 'BSSID first seen', detail: n.bssid },
            { timestamp: time, event: 'Encryption', detail: n.encryption },
            { timestamp: time, event: 'Detected', detail: `Channel ${n.channel}` },
            { timestamp: time, event: 'Scan', detail: `Signal: ${dbm} dBm` },
          ],
        });
        continue;
      }
      const added: Observation[] = [];
      if (prev.channel !== n.channel) {
        added.push({ timestamp: time, event: 'Channel changed', detail: `${prev.channel} → ${n.channel}` });
      }
      if (prev.signal !== dbm) {
        added.push({ timestamp: time, event: 'Signal changed', detail: `${prev.signal} → ${dbm} dBm` });
      }
      if (added.length > 0) {
        prev.observations = [...added.reverse(), ...prev.observations].slice(0, MAX_OBSERVATIONS);
      }
      prev.signal = dbm;
      prev.channel = n.channel;
    }
    setScan(data);
  }, []);

  useEffect(() => {
    api.getNetworks().then(applyScan).catch(() => {});
    api.getTrusted().then(setTrusted).catch(() => {});
    api.getSettings().then(setSettings).catch(() => {});

    const socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('update', (data: ScanState) => applyScan(data));
    return () => {
      socket.disconnect();
    };
  }, [applyScan]);

  const networks = useMemo(() => {
    const now = Date.now();
    return scan.networks.map((raw) =>
      toNetwork(raw, trusted, historyRef.current.get(raw.bssid)?.observations ?? [], now),
    );
  }, [scan, trusted]);

  const refreshAlerts = useCallback(() => {
    api.getAlerts().then(setAlerts).catch(() => {});
  }, []);

  const value: BackendContextValue = {
    networks,
    lastScanAt: scan.last_scan_at,
    scanning: scan.scanning,
    connected,
    trusted,
    settings,
    alerts,
    refreshAlerts,
    trustNetwork: async (ssid, bssid) => setTrusted(await api.addTrusted(ssid, bssid)),
    untrustNetwork: async (ssid, bssid) => setTrusted(await api.removeTrusted(ssid, bssid)),
    toggleScanning: async () => {
      const res = await api.setScanning(!scan.scanning);
      setScan((s) => ({ ...s, scanning: res.scanning }));
    },
    saveSettings: async (next) => setSettings(await api.updateSettings(next)),
    clearAlerts: async () => setAlerts(await api.clearAlerts()),
  };

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used inside <BackendProvider>');
  return ctx;
}

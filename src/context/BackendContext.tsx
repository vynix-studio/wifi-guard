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
import type { Network, NetworkStatus, Observation } from '../data/types';

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
  /** Desktop (browser) notifications on new Suspicious/Rogue detections. */
  desktopNotificationsEnabled: boolean;
  setDesktopNotificationsEnabled: (enabled: boolean) => Promise<void>;
  /** The browser's actual Notification permission state, so the UI can
   * explain why notifications aren't firing even though the setting is on
   * (e.g. the user denied the browser's permission prompt). 'unsupported'
   * when this browser has no Notification API at all. */
  notificationPermission: NotificationPermission | 'unsupported';
  soundAlertsEnabled: boolean;
  setSoundAlertsEnabled: (enabled: boolean) => void;
}

const BackendContext = createContext<BackendContextValue | null>(null);

const MAX_OBSERVATIONS = 15;
const LS_DESKTOP_NOTIFICATIONS = 'wifiguard.notifications.desktop';
const LS_SOUND_ALERTS = 'wifiguard.notifications.sound';

function readBoolPref(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

function writeBoolPref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage can throw in private-browsing/storage-restricted modes;
    // the preference just won't persist across reloads, which is fine.
  }
}

/** Short, distinct two-tone alert beep, synthesized with the Web Audio API
 * so there's no audio asset to ship or fail to load. */
function playAlertSound(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq: number, startAt: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + duration + 0.02);
    };
    playTone(880, 0, 0.12);
    playTone(660, 0.14, 0.16);
    // Let the context close itself once the tones finish playing.
    setTimeout(() => void ctx.close(), 500);
  } catch {
    // Non-fatal: the detection and the desktop notification still worked.
  }
}

function notificationSupport(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

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

  const [desktopNotificationsEnabled, setDesktopNotificationsEnabledState] = useState(() =>
    readBoolPref(LS_DESKTOP_NOTIFICATIONS, true),
  );
  const [soundAlertsEnabled, setSoundAlertsEnabledState] = useState(() =>
    readBoolPref(LS_SOUND_ALERTS, true),
  );
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    notificationSupport,
  );
  // bssid -> last status we already alerted on (or saw), so a network that
  // STAYS Rogue/Suspicious across many scans only notifies once, on the
  // transition into that state, not every scan cycle.
  const lastAlertedStatusRef = useRef<Map<string, NetworkStatus>>(new Map());

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

  // Fire a desktop notification (and optional sound) the moment a network
  // TRANSITIONS into Suspicious/Rogue — not on every scan while it stays
  // there, and not for networks that were already Suspicious/Rogue the
  // very first time this tab observed them without a prior status on
  // record (first load after a page refresh), to avoid a notification
  // storm from pre-existing state.
  useEffect(() => {
    const seenBefore = lastAlertedStatusRef.current.size > 0;
    for (const network of networks) {
      const prevStatus = lastAlertedStatusRef.current.get(network.bssid);
      const isAlertStatus = network.status === 'rogue' || network.status === 'suspicious';
      const isNewAlert = isAlertStatus && prevStatus !== network.status && (seenBefore || prevStatus !== undefined);
      if (isNewAlert) {
        if (desktopNotificationsEnabled && notificationSupport() === 'granted') {
          const title = network.status === 'rogue' ? 'Rogue access point detected' : 'Suspicious access point detected';
          const body = [
            `${network.ssid} (${network.bssid})`,
            `Risk score: ${network.riskScore}/100`,
            network.reasons[0],
          ]
            .filter(Boolean)
            .join('\n');
          try {
            // tag: re-notifying the same bssid+status replaces the previous
            // notification instead of stacking duplicates in the OS tray.
            new Notification(title, { body, tag: `${network.bssid}:${network.status}` });
          } catch {
            // Notification constructor can throw in some contexts (e.g. a
            // service-worker-only environment); the sound alert still fires.
          }
        }
        if (soundAlertsEnabled) playAlertSound();
      }
      lastAlertedStatusRef.current.set(network.bssid, network.status);
    }
  }, [networks, desktopNotificationsEnabled, soundAlertsEnabled]);

  const refreshAlerts = useCallback(() => {
    api.getAlerts().then(setAlerts).catch(() => {});
  }, []);

  const setDesktopNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      setDesktopNotificationsEnabledState(false);
      writeBoolPref(LS_DESKTOP_NOTIFICATIONS, false);
      return;
    }
    if (notificationSupport() === 'unsupported') {
      // Nothing to request; leave the setting off since it can't work here.
      setDesktopNotificationsEnabledState(false);
      writeBoolPref(LS_DESKTOP_NOTIFICATIONS, false);
      return;
    }
    // Requesting permission needs a user gesture (this is called from a
    // checkbox's onChange, which qualifies) and must be re-requested if the
    // user previously denied it — the browser remembers that decision.
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setNotificationPermission(permission);
    const granted = permission === 'granted';
    setDesktopNotificationsEnabledState(granted);
    writeBoolPref(LS_DESKTOP_NOTIFICATIONS, granted);
  }, []);

  const setSoundAlertsEnabled = useCallback((enabled: boolean) => {
    setSoundAlertsEnabledState(enabled);
    writeBoolPref(LS_SOUND_ALERTS, enabled);
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
    desktopNotificationsEnabled,
    setDesktopNotificationsEnabled,
    notificationPermission,
    soundAlertsEnabled,
    setSoundAlertsEnabled,
  };

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used inside <BackendProvider>');
  return ctx;
}

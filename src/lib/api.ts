// Client for the WiFiGuard Flask backend (see /backend).
// Defaults to http://localhost:5000; override with VITE_API_BASE_URL.

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

export interface RawNetwork {
  ssid: string;
  bssid: string;
  signal: number; // percent, 0-100
  channel: number;
  authentication: string;
  encryption: string;
  score: number;
  verdict: 'Safe' | 'Suspicious' | 'Rogue';
  reasons: string[];
  signals: { name: string; points: number }[];
  first_seen: string;
  last_seen: string;
}

export interface ScanState {
  networks: RawNetwork[];
  last_scan: string | null;
  last_scan_at: string | null;
  scanning: boolean;
}

export interface TrustedAp {
  ssid: string;
  bssid: string;
  added_on: string;
}

export interface AlertEntry {
  id: number;
  timestamp: string;
  ssid: string;
  bssid: string;
  score: number;
  verdict: string;
  reasons: string;
}

export interface Settings {
  scan_interval: string;
  alert_threshold: string;
  suspicious_threshold: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getNetworks: () => request<ScanState>('/api/networks'),
  getScanning: () => request<{ scanning: boolean }>('/api/scan'),
  setScanning: (scanning: boolean) =>
    request<{ scanning: boolean }>('/api/scan', {
      method: 'POST',
      body: JSON.stringify({ scanning }),
    }),
  getTrusted: () => request<TrustedAp[]>('/api/trusted'),
  addTrusted: (ssid: string, bssid: string) =>
    request<TrustedAp[]>('/api/trusted', {
      method: 'POST',
      body: JSON.stringify({ ssid, bssid }),
    }),
  removeTrusted: (ssid: string, bssid: string) =>
    request<TrustedAp[]>('/api/trusted', {
      method: 'DELETE',
      body: JSON.stringify({ ssid, bssid }),
    }),
  getAlerts: () => request<AlertEntry[]>('/api/alerts'),
  clearAlerts: () => request<AlertEntry[]>('/api/alerts', { method: 'DELETE' }),
  getSettings: () => request<Settings>('/api/settings'),
  updateSettings: (settings: Partial<Settings>) =>
    request<Settings>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  exportAlertsUrl: () => `${API_BASE_URL}/api/alerts/export`,
};

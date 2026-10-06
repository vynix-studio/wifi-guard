export type NetworkStatus = 'trusted' | 'safe' | 'unknown' | 'suspicious' | 'rogue';

export interface Observation {
  timestamp: string;
  event: string;
  detail: string;
}

export interface DetectionSignal {
  name: string;
  points: number;
}

export interface Network {
  id: string;
  ssid: string;
  bssid: string;
  /** Signal strength in dBm (approximated from the OS-reported percentage). */
  signal: number;
  channel: number;
  encryption: string;
  status: NetworkStatus;
  riskScore: number;
  firstSeen: string;
  lastSeen: string;
  observations: Observation[];
  /** Per-rule breakdown of the detection score, from the backend engine. */
  signals: DetectionSignal[];
  /** Plain-English explanation of each rule that fired. */
  reasons: string[];
}

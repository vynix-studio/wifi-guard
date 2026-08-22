export interface Network {
  id: string;
  ssid: string;
  bssid: string;
  signal: number;
  channel: number;
  encryption: string;
  status: 'trusted' | 'safe' | 'unknown' | 'suspicious' | 'rogue';
  riskScore: number;
  firstSeen: string;
  lastSeen: string;
  observations: Observation[];
}

export interface Observation {
  timestamp: string;
  event: string;
  detail: string;
}

export const MOCK_NETWORKS: Network[] = [
  {
    id: 'net-1',
    ssid: 'HomeNet',
    bssid: 'DE:AD:BE:EF:00:01',
    signal: -42,
    channel: 11,
    encryption: 'WPA2',
    status: 'trusted',
    riskScore: 2,
    firstSeen: '2h ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:12', event: 'Scan', detail: 'Signal: -42 dBm' },
      { timestamp: '18:24:02', event: 'Detected', detail: 'Channel 11' },
      { timestamp: '18:23:52', event: 'Encryption', detail: 'WPA2' },
    ],
  },
  {
    id: 'net-2',
    ssid: 'CafeWiFi',
    bssid: 'AA:BB:CC:11:22:33',
    signal: -48,
    channel: 6,
    encryption: 'WPA2',
    status: 'safe',
    riskScore: 15,
    firstSeen: '1h ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:10', event: 'Scan', detail: 'Signal: -48 dBm' },
      { timestamp: '18:24:00', event: 'Detected', detail: 'Channel 6' },
      { timestamp: '18:23:50', event: 'Encryption', detail: 'WPA2' },
    ],
  },
  {
    id: 'net-3',
    ssid: 'CafeWiFi',
    bssid: '11:22:33:AA:BB:CC',
    signal: -30,
    channel: 6,
    encryption: 'WPA2',
    status: 'rogue',
    riskScore: 75,
    firstSeen: '12m ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:12', event: 'Signal changed', detail: '-34 → -30 dBm' },
      { timestamp: '18:24:02', event: 'Channel detected', detail: '6' },
      { timestamp: '18:23:52', event: 'Encryption', detail: 'WPA2' },
      { timestamp: '18:23:42', event: 'BSSID first seen', detail: '11:22:33:AA:BB:CC' },
    ],
  },
  {
    id: 'net-4',
    ssid: 'Airport_Free',
    bssid: '9C:8D:7E:6F:5A:4B',
    signal: -71,
    channel: 1,
    encryption: 'OPEN',
    status: 'unknown',
    riskScore: 22,
    firstSeen: '45m ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:08', event: 'Scan', detail: 'Signal: -71 dBm' },
      { timestamp: '18:23:58', event: 'Detected', detail: 'Channel 1' },
      { timestamp: '18:23:48', event: 'Encryption', detail: 'OPEN' },
    ],
  },
  {
    id: 'net-5',
    ssid: 'OfficeNet',
    bssid: 'A1:B2:C3:D4:E5:F6',
    signal: -55,
    channel: 36,
    encryption: 'WPA3',
    status: 'suspicious',
    riskScore: 38,
    firstSeen: '2h ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:11', event: 'Scan', detail: 'Signal: -55 dBm' },
      { timestamp: '18:24:01', event: 'Channel anomaly', detail: '5GHz band' },
      { timestamp: '18:23:51', event: 'Encryption', detail: 'WPA3' },
    ],
  },
  {
    id: 'net-6',
    ssid: 'Guest_Network',
    bssid: 'FF:EE:DD:CC:BB:AA',
    signal: -62,
    channel: 40,
    encryption: 'WPA2',
    status: 'safe',
    riskScore: 18,
    firstSeen: '1h ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:09', event: 'Scan', detail: 'Signal: -62 dBm' },
      { timestamp: '18:23:59', event: 'Detected', detail: 'Channel 40' },
      { timestamp: '18:23:49', event: 'Encryption', detail: 'WPA2' },
    ],
  },
  {
    id: 'net-7',
    ssid: 'Xfinity',
    bssid: '12:34:56:78:9A:BC',
    signal: -78,
    channel: 149,
    encryption: 'WPA2',
    status: 'unknown',
    riskScore: 8,
    firstSeen: '30m ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:07', event: 'Scan', detail: 'Signal: -78 dBm' },
      { timestamp: '18:23:57', event: 'Detected', detail: 'Channel 149' },
      { timestamp: '18:23:47', event: 'Encryption', detail: 'WPA2' },
    ],
  },
  {
    id: 'net-8',
    ssid: 'SecureWiFi',
    bssid: '78:9A:BC:12:34:56',
    signal: -50,
    channel: 11,
    encryption: 'WPA3',
    status: 'safe',
    riskScore: 5,
    firstSeen: '3h ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:13', event: 'Scan', detail: 'Signal: -50 dBm' },
      { timestamp: '18:24:03', event: 'Detected', detail: 'Channel 11' },
      { timestamp: '18:23:53', event: 'Encryption', detail: 'WPA3' },
    ],
  },
  {
    id: 'net-9',
    ssid: 'Public_WiFi',
    bssid: 'AB:CD:EF:12:34:56',
    signal: -65,
    channel: 6,
    encryption: 'OPEN',
    status: 'unknown',
    riskScore: 35,
    firstSeen: '25m ago',
    lastSeen: '3m ago',
    observations: [
      { timestamp: '18:21:00', event: 'Last seen', detail: '3m ago' },
      { timestamp: '18:18:50', event: 'Scan', detail: 'Signal: -65 dBm' },
      { timestamp: '18:18:40', event: 'Encryption', detail: 'OPEN' },
    ],
  },
  {
    id: 'net-10',
    ssid: 'LinkedWiFi',
    bssid: 'CD:EF:12:34:56:78',
    signal: -45,
    channel: 44,
    encryption: 'WPA2',
    status: 'safe',
    riskScore: 12,
    firstSeen: '1h ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:06', event: 'Scan', detail: 'Signal: -45 dBm' },
      { timestamp: '18:23:56', event: 'Detected', detail: 'Channel 44' },
      { timestamp: '18:23:46', event: 'Encryption', detail: 'WPA2' },
    ],
  },
  {
    id: 'net-11',
    ssid: 'LocalHotspot',
    bssid: 'EF:12:34:56:78:9A',
    signal: -52,
    channel: 1,
    encryption: 'WPA2',
    status: 'unknown',
    riskScore: 28,
    firstSeen: '20m ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:05', event: 'Scan', detail: 'Signal: -52 dBm' },
      { timestamp: '18:23:55', event: 'Detected', detail: 'Channel 1' },
      { timestamp: '18:23:45', event: 'Encryption', detail: 'WPA2' },
    ],
  },
  {
    id: 'net-12',
    ssid: 'FreeInternet',
    bssid: '56:78:9A:BC:DE:F0',
    signal: -68,
    channel: 11,
    encryption: 'OPEN',
    status: 'suspicious',
    riskScore: 42,
    firstSeen: '15m ago',
    lastSeen: 'now',
    observations: [
      { timestamp: '18:24:04', event: 'Scan', detail: 'Signal: -68 dBm' },
      { timestamp: '18:23:54', event: 'Detected', detail: 'Channel 11' },
      { timestamp: '18:23:44', event: 'Encryption', detail: 'OPEN' },
    ],
  },
];

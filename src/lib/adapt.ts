import type { RawNetwork, TrustedAp } from './api';
import type { Network, NetworkStatus, Observation } from '../data/types';

/**
 * netsh/nmcli report signal as a 0-100 percentage. The UI shows dBm, so use
 * the common linear approximation: dBm = percent / 2 - 100.
 */
export function percentToDbm(percent: number): number {
  return Math.round(percent / 2 - 100);
}

export function relativeTime(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return '-';
  const diff = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (diff < 15) return 'now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function toStatus(raw: RawNetwork, trusted: TrustedAp[]): NetworkStatus {
  // Verdict wins first. A BSSID being on the trusted list does not make it
  // immune to being flagged: baseline-drift detection exists precisely to
  // catch a trusted AP's own identity going rogue (e.g. its encryption or
  // channel suddenly weakening), so Rogue/Suspicious must still surface even
  // for a BSSID that's in the trusted list.
  if (raw.verdict === 'Rogue') return 'rogue';
  if (raw.verdict === 'Suspicious') return 'suspicious';
  if (trusted.some((t) => t.ssid === raw.ssid && t.bssid === raw.bssid)) return 'trusted';
  // Scored safe against a trusted baseline for this SSID -> verified safe.
  // No baseline yet -> we simply have not vetted it.
  return trusted.some((t) => t.ssid === raw.ssid) ? 'safe' : 'unknown';
}

export function toNetwork(
  raw: RawNetwork,
  trusted: TrustedAp[],
  observations: Observation[],
  nowMs = Date.now(),
): Network {
  return {
    id: raw.bssid,
    ssid: raw.ssid,
    bssid: raw.bssid,
    signal: percentToDbm(raw.signal),
    channel: raw.channel,
    encryption: raw.encryption,
    status: toStatus(raw, trusted),
    riskScore: Math.min(100, raw.score),
    firstSeen: relativeTime(raw.first_seen, nowMs),
    lastSeen: relativeTime(raw.last_seen, nowMs),
    observations,
    signals: raw.signals ?? [],
    reasons: raw.reasons ?? [],
  };
}

import { X } from 'lucide-react';
import { Network } from '../../data/mockData';
import RiskScore from '../ui/RiskScore';
import DetectionAnalysis from '../ui/DetectionAnalysis';
import ObservationHistory from '../ui/ObservationHistory';

interface NetworkInspectorProps {
  network: Network;
  onClose: () => void;
}

export default function NetworkInspector({ network, onClose }: NetworkInspectorProps) {
  const getRiskLabel = (score: number) => {
    if (score >= 60) return 'CRITICAL';
    if (score >= 40) return 'HIGH';
    if (score >= 20) return 'MEDIUM';
    return 'LOW';
  };

  const statusColors = {
    trusted: 'bg-safe-900 text-safe-400',
    safe: 'bg-safe-900 text-safe-400',
    unknown: 'bg-unknown-900 text-unknown-400',
    suspicious: 'bg-suspicious-900 text-suspicious-400',
    rogue: 'bg-danger-900 text-danger-400',
  };

  return (
    <div className="w-80 bg-panel border-l border-divider flex flex-col overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="border-b border-divider px-5 py-4 flex items-start justify-between bg-base-800">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-primary mb-2">{network.ssid}</h2>
          <div className={`flex items-center gap-1.5 w-fit text-xs font-semibold ${statusColors[network.status]}`}>
            <div className="w-1.5 h-1.5 rounded-full"></div>
            {network.status === 'trusted' ? 'TRUSTED' : network.status.toUpperCase()}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-base-700 rounded transition-colors flex-shrink-0"
        >
          <X size={16} className="text-secondary" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Identity Section */}
        <div>
          <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">Identity</h3>
          <div className="space-y-2.5 text-xs">
            <div>
              <p className="text-tertiary mb-1">BSSID</p>
              <p className="font-mono text-primary">{network.bssid}</p>
            </div>
            <div>
              <p className="text-tertiary mb-1">SECURITY</p>
              <p className="text-primary">{network.encryption}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-divider"></div>

        {/* Signal Section */}
        <div>
          <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">Signal</h3>
          <div className="space-y-2.5 text-xs">
            <div>
              <p className="text-tertiary mb-1">STRENGTH</p>
              <p className="font-mono text-primary">{network.signal} dBm</p>
            </div>
            <div>
              <p className="text-tertiary mb-1">CHANNEL</p>
              <p className="font-mono text-primary">{network.channel}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-divider"></div>

        {/* Risk Section */}
        <div>
          <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">Risk Assessment</h3>
          <RiskScore score={network.riskScore} label={getRiskLabel(network.riskScore)} />
        </div>

        {/* Detection Analysis */}
        {network.status === 'rogue' || network.status === 'suspicious' ? (
          <>
            <div className="border-t border-divider"></div>
            <div>
              <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">Detection Signals</h3>
              <DetectionAnalysis riskScore={network.riskScore} />
            </div>
          </>
        ) : null}

        {/* Recent Observations */}
        <div className="border-t border-divider"></div>
        <div>
          <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">Recent Activity</h3>
          <ObservationHistory observations={network.observations} />
        </div>

        {/* Time Info */}
        <div className="border-t border-divider"></div>
        <div className="text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-tertiary">First observed</span>
            <span className="text-primary font-mono">{network.firstSeen}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-tertiary">Last observed</span>
            <span className="text-primary font-mono">{network.lastSeen}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

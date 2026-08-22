import { Pause } from 'lucide-react';

export default function NetworkOverviewSection() {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-semibold text-primary mb-1">Network Overview</h2>
      <p className="text-xs text-secondary leading-relaxed mb-4">
        Real-time monitoring of nearby wireless networks. Analyzing signal strength, encryption, and behavioral anomalies.
      </p>
      <button className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors">
        <Pause size={13} />
        Pause Scan
      </button>
    </div>
  );
}

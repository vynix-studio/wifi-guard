import { Pause, Play } from 'lucide-react';
import { useBackend } from '../../context/BackendContext';

export default function NetworkOverviewSection() {
  const { scanning, connected, toggleScanning } = useBackend();

  return (
    <div className="mb-2">
      <h2 className="text-lg font-semibold text-primary mb-1">Network Overview</h2>
      <p className="text-xs text-secondary leading-relaxed mb-4">
        Real-time monitoring of nearby wireless networks. Analyzing signal strength, encryption, and behavioral anomalies.
      </p>
      <button
        onClick={() => void toggleScanning()}
        disabled={!connected}
        className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors"
      >
        {scanning ? <Pause size={13} /> : <Play size={13} />}
        {scanning ? 'Pause Scan' : 'Resume Scan'}
      </button>
    </div>
  );
}

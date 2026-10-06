import { useEffect, useState } from 'react';
import { Settings, Search } from 'lucide-react';
import { useBackend } from '../../context/BackendContext';

export default function Header() {
  const { networks, scanning, connected, lastScanAt } = useBackend();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const alertCount = networks.filter(
    (n) => n.status === 'suspicious' || n.status === 'rogue'
  ).length;

  const state = !connected ? 'OFFLINE' : scanning ? 'SCANNING' : 'PAUSED';
  const secondsAgo = lastScanAt
    ? Math.max(0, Math.round((now - new Date(lastScanAt).getTime()) / 1000))
    : null;

  return (
    <header className="h-14 bg-panel border-divider border-b flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="text-xs font-semibold tracking-wide">AEGIS</div>

        <div className="flex items-center gap-2.5 ml-4">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              state === 'SCANNING' ? 'bg-primary-500 pulse-soft' : state === 'PAUSED' ? 'bg-unknown-500' : 'bg-danger-500'
            }`}
          ></span>
          <span className="text-xs font-medium text-secondary">{state}</span>
          <span className="text-xs text-tertiary">
            {secondsAgo === null ? 'no scan yet' : `${secondsAgo}s ago`}
          </span>
        </div>

        <div className="flex items-center gap-6 ml-auto">
          <div className="flex items-center gap-6 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-tertiary font-semibold">{networks.length} NETWORKS</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-tertiary font-semibold">{alertCount} ALERTS</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="p-1.5 hover:bg-base-700 rounded transition-colors" title="Search (⌘K)">
          <Search size={15} className="text-secondary" />
        </button>
        <button className="p-1.5 hover:bg-base-700 rounded transition-colors" title="Settings">
          <Settings size={15} className="text-secondary" />
        </button>
      </div>
    </header>
  );
}

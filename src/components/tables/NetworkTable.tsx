import { Network } from '../../data/types';
import StatusBadge from '../ui/StatusBadge';

interface NetworkTableProps {
  networks: Network[];
  onSelectNetwork: (id: string) => void;
}

export default function NetworkTable({ networks, onSelectNetwork }: NetworkTableProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">Live Networks</h3>
      <div className="border border-divider rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-divider bg-base-800">
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">SSID</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">BSSID</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">SIGNAL</th>
              <th className="text-center px-3 py-2.5 text-xs font-semibold text-tertiary">CH</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">SECURITY</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {networks.map((network, index) => (
              <tr
                key={network.id}
                onClick={() => onSelectNetwork(network.id)}
                className={`border-b border-divider hover:bg-base-800 cursor-pointer transition-colors ${
                  index === networks.length - 1 ? 'border-b-0' : ''
                }`}
              >
                <td className="px-3 py-2.5 text-primary font-medium">{network.ssid}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-tertiary">{network.bssid}</td>
                <td className="px-3 py-2.5 text-secondary font-mono text-xs">{network.signal}</td>
                <td className="px-3 py-2.5 text-secondary font-mono text-xs text-center">{network.channel}</td>
                <td className="px-3 py-2.5 text-secondary text-xs">{network.encryption}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={network.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

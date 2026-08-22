import { useState } from "react";
import NetworkOverviewSection from "../components/sections/NetworkOverviewSection";
import NetworkMetrics from "../components/sections/NetworkMetrics";
import NetworkTable from "../components/tables/NetworkTable";
import NetworkInspector from "../components/inspector/NetworkInspector";
import { MOCK_NETWORKS } from "../data/mockData";

interface ScanOverviewProps {
  selectedNetworkId: string | null;
  onSelectNetwork: (id: string | null) => void;
}

export default function ScanOverview({
  selectedNetworkId,
  onSelectNetwork,
}: ScanOverviewProps) {
  const [networks] = useState(MOCK_NETWORKS);
  const selectedNetwork = selectedNetworkId
    ? networks.find((n) => n.id === selectedNetworkId)
    : null;

  const stats = {
    total: networks.length,
    trusted: networks.filter((n) => n.status === "trusted").length,
    unknown: networks.filter((n) => n.status === "unknown").length,
    suspicious: networks.filter((n) => n.status === "suspicious").length,
    rogue: networks.filter((n) => n.status === "rogue").length,
  };

  return (
    <div className="flex-1 flex">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <NetworkOverviewSection />
          <div className="mt-6">
            <NetworkMetrics stats={stats} />
          </div>
          <div className="mt-8">
            <NetworkTable
              networks={networks}
              onSelectNetwork={onSelectNetwork}
            />
          </div>
        </div>
      </div>

      {selectedNetwork && (
        <NetworkInspector
          network={selectedNetwork}
          onClose={() => onSelectNetwork(null)}
        />
      )}
    </div>
  );
}

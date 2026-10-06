import { useEffect } from "react";
import { Download } from "lucide-react";
import StatusBadge from "../components/ui/StatusBadge";
import { useBackend } from "../context/BackendContext";
import { api } from "../lib/api";

export default function AlertsPage() {
  const { alerts, refreshAlerts, lastScanAt } = useBackend();

  // Refresh on open and after every scan so new detections show up live.
  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts, lastScanAt]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-semibold text-primary mb-1">
            Security Alerts
          </h1>
          <p className="text-xs text-secondary">
            Real-time security events and anomaly detections
          </p>
        </div>
        {alerts.length > 0 && (
          <a
            href={api.exportAlertsUrl()}
            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <Download size={13} />
            Export CSV
          </a>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-base-800 flex items-center justify-center mb-4">
            <div className="w-6 h-6 border border-tertiary rounded-full"></div>
          </div>
          <h2 className="text-sm font-semibold text-primary mb-1">
            No alerts yet
          </h2>
          <p className="text-xs text-tertiary max-w-xs">
            Your wireless environment is being continuously monitored. Suspicious
            networks and security events will appear here.
          </p>
        </div>
      ) : (
        <div className="border border-divider rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-base-800">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">TIME</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">SSID</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">BSSID</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">SCORE</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">STATUS</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-tertiary">REASONS</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, index) => (
                <tr
                  key={alert.id}
                  className={`border-b border-divider align-top ${
                    index === alerts.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-tertiary whitespace-nowrap">
                    {alert.timestamp.replace("T", " ")}
                  </td>
                  <td className="px-3 py-2.5 text-primary font-medium">{alert.ssid}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-tertiary">{alert.bssid}</td>
                  <td className="px-3 py-2.5 text-secondary font-mono text-xs">{alert.score}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      status={alert.verdict === "Rogue" ? "rogue" : "suspicious"}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-tertiary max-w-md">{alert.reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

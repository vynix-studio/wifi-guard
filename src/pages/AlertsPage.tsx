export default function AlertsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-primary mb-1">
          Security Alerts
        </h1>
        <p className="text-xs text-secondary">
          Real-time security events and anomaly detections
        </p>
      </div>

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
    </div>
  );
}

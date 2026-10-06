interface NetworkMetricsProps {
  stats: {
    total: number;
    trusted: number;
    unknown: number;
    suspicious: number;
    rogue: number;
  };
}

export default function NetworkMetrics({ stats }: NetworkMetricsProps) {
  const metrics = [
    { label: 'NETWORKS', value: stats.total, color: 'text-primary-400' },
    { label: 'TRUSTED', value: stats.trusted, color: 'text-safe-400' },
    { label: 'UNKNOWN', value: stats.unknown, color: 'text-unknown-400' },
    { label: 'SUSPICIOUS', value: stats.suspicious, color: 'text-suspicious-400' },
    { label: 'ROGUE', value: stats.rogue, color: 'text-danger-400' },
  ];

  return (
    <div className="flex gap-10">
      {metrics.map(({ label, value, color }) => (
        <div key={label} className="flex flex-col">
          <p className="text-xs text-tertiary font-semibold tracking-wide mb-1.5">{label}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

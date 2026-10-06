interface StatusBadgeProps {
  status: 'trusted' | 'safe' | 'unknown' | 'suspicious' | 'rogue';
}

const statusConfig = {
  trusted: { label: 'TRUSTED', dot: 'bg-safe-500', text: 'text-safe-400' },
  safe: { label: 'SAFE', dot: 'bg-safe-500', text: 'text-safe-400' },
  unknown: { label: 'UNKNOWN', dot: 'bg-unknown-500', text: 'text-unknown-400' },
  suspicious: { label: 'SUSPICIOUS', dot: 'bg-suspicious-500', text: 'text-suspicious-400' },
  rogue: { label: 'ROGUE', dot: 'bg-danger-500', text: 'text-danger-400' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <div className={`flex items-center gap-2 ${config.text}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></div>
      <span className="text-xs font-semibold">{config.label}</span>
    </div>
  );
}

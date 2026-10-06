interface RiskScoreProps {
  score: number;
  label: string;
}

export default function RiskScore({ score, label }: RiskScoreProps) {
  const getBarColor = (score: number) => {
    if (score >= 60) return 'bg-danger-600';
    if (score >= 40) return 'bg-suspicious-600';
    if (score >= 20) return 'bg-unknown-600';
    return 'bg-safe-600';
  };

  const getLabelColor = (score: number) => {
    if (score >= 60) return 'text-danger-400';
    if (score >= 40) return 'text-suspicious-400';
    if (score >= 20) return 'text-unknown-400';
    return 'text-safe-400';
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${getLabelColor(score)}`}>{score}</span>
        <span className="text-xs text-tertiary font-mono">/100</span>
      </div>
      <div className="w-full h-1.5 bg-base-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor(score)} transition-all duration-300`}
          style={{ width: `${score}%` }}
        ></div>
      </div>
      <p className={`text-xs font-semibold tracking-wide ${getLabelColor(score)}`}>{label} RISK</p>
    </div>
  );
}

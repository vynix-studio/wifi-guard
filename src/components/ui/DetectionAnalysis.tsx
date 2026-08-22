interface DetectionAnalysisProps {
  riskScore: number;
}

export default function DetectionAnalysis({ riskScore }: DetectionAnalysisProps) {
  const rules = [
    { name: 'BSSID mismatch', contribution: 35 },
    { name: 'Encryption downgrade', contribution: 25 },
    { name: 'Channel anomaly', contribution: 15 },
  ];

  // Normalize contributions to match the risk score
  const totalContribution = rules.reduce((sum, r) => sum + r.contribution, 0);
  const scale = riskScore / totalContribution;

  return (
    <div className="space-y-3">
      {rules.map((rule, index) => (
        <div key={index} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-primary font-medium">{rule.name}</span>
            <span className="text-xs text-danger-400 font-mono font-semibold">+{Math.round(rule.contribution * scale)}</span>
          </div>
          <div className="w-full h-1 bg-base-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-danger-600 transition-all duration-300"
              style={{ width: `${(rule.contribution / totalContribution) * 100}%` }}
            ></div>
          </div>
        </div>
      ))}
      <div className="border-t border-divider mt-3 pt-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-tertiary">TOTAL SCORE</span>
          <span className="font-semibold text-danger-400 font-mono">{riskScore}</span>
        </div>
      </div>
    </div>
  );
}

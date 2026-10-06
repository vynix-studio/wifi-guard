import type { DetectionSignal } from '../../data/types';

interface DetectionAnalysisProps {
  riskScore: number;
  signals: DetectionSignal[];
  reasons: string[];
}

export default function DetectionAnalysis({ riskScore, signals, reasons }: DetectionAnalysisProps) {
  const totalPoints = signals.reduce((sum, s) => sum + s.points, 0) || 1;

  return (
    <div className="space-y-3">
      {signals.map((signal) => (
        <div key={signal.name} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-primary font-medium">{signal.name}</span>
            <span className="text-xs text-danger-400 font-mono font-semibold">+{signal.points}</span>
          </div>
          <div className="w-full h-1 bg-base-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-danger-600 transition-all duration-300"
              style={{ width: `${(signal.points / totalPoints) * 100}%` }}
            ></div>
          </div>
        </div>
      ))}
      {reasons.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {reasons.map((reason) => (
            <li key={reason} className="text-xs text-tertiary leading-relaxed">
              {reason}
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-divider mt-3 pt-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-tertiary">TOTAL SCORE</span>
          <span className="font-semibold text-danger-400 font-mono">{riskScore}</span>
        </div>
      </div>
    </div>
  );
}

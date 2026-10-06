import { Observation } from '../../data/types';

interface ObservationHistoryProps {
  observations: Observation[];
}

export default function ObservationHistory({ observations }: ObservationHistoryProps) {
  return (
    <div className="space-y-2.5">
      {observations.map((obs, index) => (
        <div key={index} className="text-xs">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-mono text-tertiary text-xs">{obs.timestamp}</span>
            <span className="text-secondary font-medium flex-1">{obs.event}</span>
          </div>
          <p className="text-tertiary pl-0.5">{obs.detail}</p>
        </div>
      ))}
    </div>
  );
}

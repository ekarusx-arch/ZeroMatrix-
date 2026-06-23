import { Clock3 } from 'lucide-react';

const CAPACITY_OPTIONS = [240, 360, 480];

function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours}h ${rest}m`;
  if (hours > 0) return `${hours}h`;
  return `${rest}m`;
}

export default function TimeBudget({ capacity, onCapacityChange, quadrantMinutes, unestimatedCount }) {
  const executionMinutes = quadrantMinutes.q1 + quadrantMinutes.q2;
  const remainingMinutes = Math.max(0, capacity - executionMinutes);
  const isOver = executionMinutes > capacity;
  const getWidth = (minutes) => `${Math.min(100, (minutes / Math.max(capacity, 1)) * 100)}%`;

  return (
    <section className={`matrix-time-budget ${isOver ? 'is-over' : ''}`} aria-label="오늘의 시간 배분">
      <div className="matrix-time-budget-header">
        <div>
          <span><Clock3 size={14} aria-hidden="true" /> 오늘 실행 시간</span>
          <strong>{formatMinutes(executionMinutes)} / {formatMinutes(capacity)}</strong>
        </div>
        <div className="matrix-capacity-options" aria-label="하루 가용 시간">
          {CAPACITY_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={capacity === minutes ? 'is-active' : ''}
              onClick={() => onCapacityChange(minutes)}
              aria-pressed={capacity === minutes}
            >
              {minutes / 60}h
            </button>
          ))}
        </div>
      </div>
      <div className="matrix-time-track" aria-hidden="true">
        <span className="is-q1" style={{ width: getWidth(quadrantMinutes.q1) }} />
        <span className="is-q2" style={{ width: getWidth(quadrantMinutes.q2) }} />
      </div>
      <div className="matrix-time-legend">
        <span><i className="is-q1" /> 즉시 {formatMinutes(quadrantMinutes.q1)}</span>
        <span><i className="is-q2" /> 계획 {formatMinutes(quadrantMinutes.q2)}</span>
        <span className={isOver ? 'is-warning' : ''}>
          {isOver ? `초과 ${formatMinutes(executionMinutes - capacity)}` : `남음 ${formatMinutes(remainingMinutes)}`}
        </span>
        {unestimatedCount > 0 && <span className="is-warning">시간 미정 {unestimatedCount}</span>}
      </div>
    </section>
  );
}

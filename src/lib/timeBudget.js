export const TIME_ESTIMATE_STEPS = [0, 15, 30, 60, 120];

export function getNextTimeEstimate(value) {
  const parsed = Number(value);
  const current = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  return TIME_ESTIMATE_STEPS.find((minutes) => minutes > current) ?? 0;
}

export function formatMinutes(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  if (hours > 0 && rest > 0) return `${hours}h ${rest}m`;
  if (hours > 0) return `${hours}h`;
  return `${rest}m`;
}

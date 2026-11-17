/** A percentage change has no finite baseline when the previous count was zero. */
export function relativeChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous < 0) {
    return null;
  }
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

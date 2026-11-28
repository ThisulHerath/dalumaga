export type SimulatedEstimate = { minutes: number; createdAt: number; fixAt: string };
export type DeadlineAssessment =
  | {
      kind: 'unknown';
      reason:
        | 'deadline'
        | 'location'
        | 'source'
        | 'stale-location'
        | 'clock'
        | 'estimate'
        | 'changed-location'
        | 'stale-estimate'
        | 'configuration';
    }
  | { kind: 'overdue'; deadline: number }
  | { kind: 'at-risk' | 'on-time'; deadline: number; eta: number; delayMinutes: number };

/** Simulation only: travel minutes are supplied by a person, never inferred from coordinates. */
export function assessDeadline(input: {
  deadline: string | null;
  fixAt: string | null;
  source: string | null;
  estimate: SimulatedEstimate | null;
  now: number;
  maxAgeMinutes: number;
}): DeadlineAssessment {
  const { deadline, fixAt, source, estimate, now, maxAgeMinutes } = input;
  if (!Number.isFinite(now)) return { kind: 'unknown', reason: 'configuration' };
  const deadlineMs = deadline === null ? NaN : Date.parse(deadline);
  if (!Number.isFinite(deadlineMs)) return { kind: 'unknown', reason: 'deadline' };
  if (now > deadlineMs) return { kind: 'overdue', deadline: deadlineMs };
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0 || maxAgeMinutes > 1440)
    return { kind: 'unknown', reason: 'configuration' };
  const fixMs = fixAt === null ? NaN : Date.parse(fixAt);
  if (!Number.isFinite(fixMs)) return { kind: 'unknown', reason: 'location' };
  if (source !== 'simulator') return { kind: 'unknown', reason: 'source' };
  if (fixMs > now) return { kind: 'unknown', reason: 'clock' };
  const limit = maxAgeMinutes * 60_000;
  if (now - fixMs > limit) return { kind: 'unknown', reason: 'stale-location' };
  if (
    !estimate ||
    !Number.isInteger(estimate.minutes) ||
    estimate.minutes < 0 ||
    estimate.minutes > 720 ||
    !Number.isFinite(estimate.createdAt)
  )
    return { kind: 'unknown', reason: 'estimate' };
  if (estimate.fixAt !== fixAt) return { kind: 'unknown', reason: 'changed-location' };
  if (estimate.createdAt > now || estimate.createdAt < fixMs)
    return { kind: 'unknown', reason: 'clock' };
  if (now - estimate.createdAt > limit) return { kind: 'unknown', reason: 'stale-estimate' };
  const eta = estimate.createdAt + estimate.minutes * 60_000;
  if (eta < now) return { kind: 'unknown', reason: 'stale-estimate' };
  return {
    kind: eta > deadlineMs ? 'at-risk' : 'on-time',
    deadline: deadlineMs,
    eta,
    delayMinutes: Math.max(0, Math.ceil((eta - deadlineMs) / 60_000)),
  };
}

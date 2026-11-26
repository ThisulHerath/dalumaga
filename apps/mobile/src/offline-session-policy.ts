export function canUnlockSavedSession(savedAt: number, expiresAt: string, now: number): boolean {
  const expiry = Date.parse(expiresAt);
  return (
    Number.isFinite(savedAt) &&
    Number.isFinite(expiry) &&
    Number.isFinite(now) &&
    now >= savedAt &&
    now < expiry
  );
}

export function locationAge(fix: string | null, now = Date.now()): string {
  if (!fix) return 'Location unknown / ස්ථානය නොදනී';
  const time = Date.parse(fix);
  if (!Number.isFinite(time)) return 'Invalid location time / ස්ථාන වේලාව වැරදියි';
  if (time > now) return 'Location time is in the future; check clocks / වේලාව පරීක්ෂා කරන්න';
  return `Last fix ${Math.floor((now - time) / 60000)} minutes ago / අවසන් ස්ථාන දත්ත මිනිත්තු ගණන`;
}

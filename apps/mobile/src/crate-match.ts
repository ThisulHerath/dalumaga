export type ScannableLoad = { loadId: string; crateCode: string; recorded: boolean };
export type CrateMatch<T> =
  | { kind: 'match'; load: T }
  | { kind: 'not-found' | 'recorded' | 'ambiguous' | 'empty' };

// Crate labels contain the exact registered code, not a URL or a load identifier.
export function matchCrate<T extends ScannableLoad>(input: string, loads: T[]): CrateMatch<T> {
  const code = input.trim();
  if (!code) return { kind: 'empty' };
  const matches = loads.filter((load) => load.crateCode === code);
  if (!matches.length) return { kind: 'not-found' };
  const available = matches.filter((load) => !load.recorded);
  if (!available.length) return { kind: 'recorded' };
  if (matches.length !== 1) return { kind: 'ambiguous' };
  return { kind: 'match', load: available[0]! };
}

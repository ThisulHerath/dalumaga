import type { FuelReading, TimeRange, TrackerPosition, TrackerProvider } from './hardware.js';

export type RouteSample = TrackerPosition & { fuelLitres: number };
export type SignalGap = { from: string; to: string };
function timestamp(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error('Invalid timestamp');
  return result;
}
export class SimulatedTracker implements TrackerProvider {
  private readonly samples: RouteSample[];
  private readonly gaps: { from: number; to: number }[];
  constructor(samples: readonly RouteSample[], gaps: readonly SignalGap[] = []) {
    this.samples = samples
      .map((sample) => {
        timestamp(sample.recordedAt);
        if (
          !Number.isFinite(sample.latitude) ||
          Math.abs(sample.latitude) > 90 ||
          !Number.isFinite(sample.longitude) ||
          Math.abs(sample.longitude) > 180 ||
          !Number.isFinite(sample.fuelLitres) ||
          sample.fuelLitres < 0
        ) {
          throw new RangeError('Invalid route sample');
        }
        return { ...sample };
      })
      .sort((a, b) => timestamp(a.recordedAt) - timestamp(b.recordedAt));
    this.gaps = gaps.map((gap) => {
      const from = timestamp(gap.from);
      const to = timestamp(gap.to);
      if (from >= to) throw new RangeError('Signal gap must have positive duration');
      return { from, to };
    });
  }
  private select(range: TimeRange): RouteSample[] {
    const from = timestamp(range.from);
    const to = timestamp(range.to);
    if (from >= to) throw new RangeError('Range must have positive duration');
    return this.samples.filter((sample) => {
      const time = timestamp(sample.recordedAt);
      return (
        time >= from && time < to && !this.gaps.some((gap) => time >= gap.from && time < gap.to)
      );
    });
  }
  async getPositions(range: TimeRange): Promise<TrackerPosition[]> {
    return this.select(range).map(({ recordedAt, latitude, longitude, stopped }) => ({
      recordedAt,
      latitude,
      longitude,
      stopped,
    }));
  }
  async getFuelReadings(range: TimeRange): Promise<FuelReading[]> {
    return this.select(range).map(({ recordedAt, fuelLitres }) => ({
      recordedAt,
      litres: fuelLitres,
    }));
  }
}

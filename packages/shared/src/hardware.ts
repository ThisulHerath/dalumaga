export type Unsubscribe = () => void;
export type ScaleReading = {
  grams: number;
  capturedAt: string;
  source: 'simulator' | 'manual' | 'bluetooth';
  reason?: string;
};
export interface ScaleProvider {
  connect(): Promise<void>;
  onStableWeight(listener: (reading: ScaleReading) => void): Unsubscribe;
  disconnect(): Promise<void>;
}
export type TrackerPosition = {
  recordedAt: string;
  latitude: number;
  longitude: number;
  stopped: boolean;
};
export type FuelReading = { recordedAt: string; litres: number };
export type TimeRange = { from: string; to: string };
export interface TrackerProvider {
  getPositions(range: TimeRange): Promise<TrackerPosition[]>;
  getFuelReadings(range: TimeRange): Promise<FuelReading[]>;
}
export function validateGrams(grams: number): void {
  if (!Number.isInteger(grams) || grams < 0 || grams > 999_999_999) {
    throw new RangeError('Weight must be a nonnegative whole number of grams');
  }
}

import { validateGrams } from './hardware.js';
import type { ScaleProvider, ScaleReading, Unsubscribe } from './hardware.js';

abstract class EventScale implements ScaleProvider {
  protected connected = false;
  private listeners = new Set<(reading: ScaleReading) => void>();
  async connect(): Promise<void> {
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  onStableWeight(listener: (reading: ScaleReading) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  protected emit(reading: ScaleReading): void {
    if (!this.connected) throw new Error('Scale is disconnected');
    for (const listener of this.listeners) listener({ ...reading });
  }
}

export type ScaleSample = {
  grams: number;
  capturedAt: string;
  noiseGrams?: number;
  disconnect?: boolean;
};
export class SimulatedScale extends EventScale {
  private cursor = 0;
  constructor(private readonly samples: readonly ScaleSample[]) {
    super();
  }
  // Advance explicitly so callers control playback and tests need no timers.
  next(): void {
    if (!this.connected) throw new Error('Scale is disconnected');
    const sample = this.samples[this.cursor];
    if (!sample) throw new Error('No simulated samples remain');
    if (sample.disconnect) {
      this.cursor++;
      this.connected = false;
      return;
    }
    const grams = sample.grams + (sample.noiseGrams ?? 0);
    validateGrams(grams);
    if (!Number.isFinite(Date.parse(sample.capturedAt)))
      throw new Error('Invalid sample timestamp');
    this.cursor++;
    this.emit({ grams, capturedAt: sample.capturedAt, source: 'simulator' });
  }
}
export class ManualEntryScale extends EventScale {
  submit(grams: number, reason: string, capturedAt = new Date().toISOString()): void {
    validateGrams(grams);
    if (!reason.trim()) throw new Error('Manual entry requires a reason');
    if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('Invalid timestamp');
    this.emit({ grams, capturedAt, source: 'manual', reason: reason.trim() });
  }
}
export class BluetoothScale implements ScaleProvider {
  async connect(): Promise<void> {
    throw new Error('Bluetooth scale integration is not implemented');
  }
  onStableWeight(listener: (reading: ScaleReading) => void): Unsubscribe {
    void listener;
    throw new Error('Bluetooth scale integration is not implemented');
  }
  async disconnect(): Promise<void> {
    /* No device is connected. */
  }
}

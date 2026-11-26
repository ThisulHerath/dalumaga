import { z } from 'zod';
export * from './hardware.js';
export * from './scales.js';
export * from './tracker-simulator.js';

export const APP_NAME = 'DaluMaga';
export const RoleSchema = z.enum([
  'weigher',
  'driver',
  'receiver',
  'dispatcher',
  'manager',
  'admin',
]);
export type Role = z.infer<typeof RoleSchema>;
export const WeightGramsSchema = z.number().int().min(0).max(999_999_999);
export type WeightGrams = z.infer<typeof WeightGramsSchema>;
export const HealthSchema = z.object({ service: z.literal(APP_NAME), status: z.literal('ok') });
export type Health = z.infer<typeof HealthSchema>;

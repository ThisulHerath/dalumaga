import { HealthSchema } from '@dalumaga/shared';
export async function checkApi(baseUrl: string, request = fetch): Promise<void> {
  const response = await request(baseUrl.replace(/\/$/, '') + '/health');
  if (!response.ok) throw new Error('API unavailable');
  HealthSchema.parse(await response.json());
}

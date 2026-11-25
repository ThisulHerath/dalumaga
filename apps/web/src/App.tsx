import { APP_NAME, HealthSchema } from '@dalumaga/shared';
import { useState } from 'react';

export function App() {
  const [status, setStatus] = useState('Unchecked');
  async function checkConnection() {
    setStatus('Checking…');
    try {
      const response = await fetch(
        (import.meta.env.VITE_API_URL || 'http://localhost:3000/v1') + '/health',
      );
      if (!response.ok) throw new Error('API unavailable');
      HealthSchema.parse(await response.json());
      setStatus('Connected');
    } catch {
      setStatus('Unavailable');
    }
  }
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <h2>Office</h2>
      <button onClick={checkConnection}>Check API connection</button>
      <p role="status">{status}</p>
    </main>
  );
}

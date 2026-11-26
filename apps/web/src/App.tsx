import { APP_NAME } from '@dalumaga/shared';
import { useState } from 'react';
type Comparison = {
  pickupKg: string | null;
  receiptKg: string | null;
  differenceKg: string | null;
};
const api = import.meta.env?.VITE_API_URL || 'http://localhost:3000/v1';
export function App() {
  const [data, setData] = useState<Comparison>();
  const [status, setStatus] = useState('Prepare the sample trip.');
  async function load() {
    try {
      const response = await fetch(api + '/demo/comparison');
      if (!response.ok) throw new Error('Cannot load sample comparison');
      setData((await response.json()) as Comparison);
      setStatus('Sample data / ආදර්ශ දත්ත');
    } catch {
      setStatus('Could not load. Check the local demo API.');
    }
  }
  async function setup() {
    try {
      const response = await fetch(api + '/demo/setup', { method: 'POST' });
      if (!response.ok) throw new Error('Setup failed');
      await load();
    } catch {
      setStatus('Sample setup failed. Check the local demo API.');
    }
  }
  return (
    <main>
      <h1>{APP_NAME} · දළුමඟ</h1>
      <h2>Sample weight comparison / බර වෙනස</h2>
      <p className="sample">SIMULATION · Sample crate C042</p>
      <button onClick={() => void setup()}>
        Prepare sample trip / ආදර්ශ ගමන සූදානම් කරන්න
      </button>{' '}
      <button onClick={() => void load()}>Refresh / යළි බලන්න</button>
      <p role="status" className="status">
        {status}
      </p>
      {data && (
        <dl>
          <dt>Pickup / එකතු කළ බර</dt>
          <dd>{data.pickupKg === null ? 'Awaiting pickup / බලා සිටී' : data.pickupKg + ' kg'}</dd>
          <dt>Factory / කම්හලේ බර</dt>
          <dd>
            {data.receiptKg === null ? 'Awaiting receipt / බලා සිටී' : data.receiptKg + ' kg'}
          </dd>
          <dt>Receipt minus pickup / බර වෙනස</dt>
          <dd>
            {data.differenceKg === null
              ? 'Pending / බලා සිටී'
              : Number(data.differenceKg) < 0
                ? Math.abs(Number(data.differenceKg)) + ' kg less at receipt'
                : data.differenceKg + ' kg'}
          </dd>
        </dl>
      )}
    </main>
  );
}

import { SimulatedScale } from '@dalumaga/shared';
import { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, Text } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { openQueue, pendingWeighings, saveWeighing } from './src/queue';
import { syncQueue } from './src/sync';
const LOAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const API = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000/v1';
export default function App() {
  const [db, setDb] = useState<SQLiteDatabase>();
  const [stage, setStage] = useState<'pickup' | 'receipt'>('pickup');
  const [gross, setGross] = useState<number>();
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState('Sample mode / ආදර්ශ දත්ත');
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);
  async function refresh(database: SQLiteDatabase) {
    setPending((await pendingWeighings(database)).length);
  }
  useEffect(() => {
    let current: SQLiteDatabase | undefined;
    async function retry() {
      if (!current || syncing.current) return;
      syncing.current = true;
      try {
        await syncQueue(current, API);
        await refresh(current);
      } catch {
        await refresh(current);
      } finally {
        syncing.current = false;
      }
    }
    void openQueue()
      .then(async (opened) => {
        current = opened;
        setDb(opened);
        await refresh(opened);
        void retry();
      })
      .catch(() => setMessage('Cannot open local storage'));
    const timer = setInterval(() => void retry(), 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void retry();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  async function simulate() {
    const scale = new SimulatedScale([
      { grams: stage === 'pickup' ? 20000 : 17000, capturedAt: new Date().toISOString() },
    ]);
    scale.onStableWeight((reading) => setGross(reading.grams));
    await scale.connect();
    scale.next();
    await scale.disconnect();
  }
  async function save() {
    if (!db || gross === undefined || busy) return;
    setBusy(true);
    try {
      await saveWeighing(db, { loadId: LOAD, stage, grossGrams: gross, tareGrams: 2000 });
      await refresh(db);
      setGross(undefined);
      setMessage('Saved on phone / දුරකථනයේ සුරැකිණි');
    } catch {
      setMessage('Could not save. This stage may already be recorded.');
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (!db || busy || syncing.current) return;
    setBusy(true);
    syncing.current = true;
    try {
      await syncQueue(db, API);
      await refresh(db);
      setMessage('Sync complete / යැවීම අවසන්');
    } catch {
      await refresh(db);
      setMessage('Not synced. Retry when connected.');
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 18, justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 28, fontWeight: '700' }}>DaluMaga · දළුමඟ</Text>
      <Text>SIMULATION / ආදර්ශ දත්ත · Sample crate C042 · 2 kg tare</Text>
      <Button
        title="Pickup / එකතු කිරීම"
        onPress={() => {
          setStage('pickup');
          setGross(undefined);
        }}
      />
      <Button
        title="Receipt / භාරගැනීම"
        onPress={() => {
          setStage('receipt');
          setGross(undefined);
        }}
      />
      <Text style={{ fontSize: 22 }}>{stage === 'pickup' ? 'Pickup' : 'Receipt'}</Text>
      <Button title="Read simulated scale / තරාදිය කියවන්න" onPress={() => void simulate()} />
      <Text>Gross / මුළු බර {gross === undefined ? '—' : gross / 1000} kg</Text>
      <Text>Tare / හිස් බර 2 kg</Text>
      <Text style={{ fontSize: 22 }}>
        Net / ශුද්ධ බර {gross === undefined ? '—' : (gross - 2000) / 1000} kg
      </Text>
      <Button
        title="Save weight / බර සුරකින්න"
        disabled={gross === undefined || !db || busy}
        onPress={() => void save()}
      />
      <Text>
        {pending} pending / යැවීමට {pending}ක්
      </Text>
      <Button title="Sync / යවන්න" disabled={!db || busy} onPress={() => void sync()} />
      <Text accessibilityLiveRegion="polite">{message}</Text>
    </ScrollView>
  );
}

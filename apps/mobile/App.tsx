import { SimulatedScale } from '@dalumaga/shared';
import { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, Text, TextInput } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  listStaffPending,
  openStaffQueue,
  staffIssues,
  storeStaffReading,
  syncStaff,
} from './src/staff-queue';
type Identity = { id: string; displayName: string; roles: string[] };
type Load = {
  loadId: string;
  crateCode: string;
  tareId: string;
  tareKg: string;
  scaleId: string;
  recorded: boolean;
};
const API = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000/v1';
export default function App() {
  const [db, setDb] = useState<SQLiteDatabase>();
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const [token, setToken] = useState(''),
    [user, setUser] = useState<Identity>();
  const [loads, setLoads] = useState<Load[]>([]),
    [selected, setSelected] = useState<Load>();
  const [gross, setGross] = useState<number>(),
    [pending, setPending] = useState(0),
    [problems, setProblems] = useState(0);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const syncing = useRef(false);
  useEffect(() => {
    void openStaffQueue()
      .then(setDb)
      .catch(() => setMessage('Cannot open local storage'));
  }, []);
  async function refresh(database: SQLiteDatabase, actor: string) {
    setPending((await listStaffPending(database, actor)).length);
    setProblems((await staffIssues(database, actor))?.count ?? 0);
  }
  async function login() {
    if (!db || busy) return;
    setBusy(true);
    try {
      const response = await fetch(API + '/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error('Sign in failed / පිවිසීම අසාර්ථකයි');
      const session = (await response.json()) as { token: string; user: Identity };
      if (!session.user.roles.some((role) => ['weigher', 'receiver'].includes(role)))
        throw new Error('Field account required');
      const manifest = await fetch(API + '/staff/loads', {
        headers: { authorization: 'Bearer ' + session.token },
      });
      if (!manifest.ok) throw new Error('Could not load assigned crates');
      const list = (await manifest.json()) as Load[];
      setPassword('');
      setUser(session.user);
      setToken(session.token);
      setLoads(list);
      setSelected(list.find((load) => !load.recorded));
      await refresh(db, session.user.id);
      setMessage('');
    } catch (error) {
      setPassword('');
      setMessage(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (!db || !user || !token || syncing.current) return;
    syncing.current = true;
    setBusy(true);
    try {
      await syncStaff(db, user.id, token, API);
      await refresh(db, user.id);
      setMessage('Sync checked / යැවීම් පරීක්ෂා කළා');
    } catch (error) {
      await refresh(db, user.id);
      setMessage(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!token || !user || !db) return;
    const timer = setInterval(() => void sync(), 15000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [token, user, db]);
  async function measure() {
    if (!selected || !user) return;
    const stage = user.roles.includes('weigher') ? 'pickup' : 'receipt';
    const scale = new SimulatedScale([
      {
        grams: Math.round(Number(selected.tareKg) * 1000) + (stage === 'pickup' ? 18000 : 15000),
        capturedAt: new Date().toISOString(),
      },
    ]);
    scale.onStableWeight((reading) => setGross(reading.grams));
    await scale.connect();
    scale.next();
    await scale.disconnect();
  }
  async function save() {
    if (!db || !user || !selected || gross === undefined || busy) return;
    setBusy(true);
    try {
      await storeStaffReading(db, user.id, {
        loadId: selected.loadId,
        stage: user.roles.includes('weigher') ? 'pickup' : 'receipt',
        grossGrams: gross,
        tareId: selected.tareId,
        scaleId: selected.scaleId,
      });
      await refresh(db, user.id);
      setLoads((current) =>
        current.map((load) =>
          load.loadId === selected.loadId ? { ...load, recorded: true } : load,
        ),
      );
      setSelected(undefined);
      setGross(undefined);
      setMessage('Saved on phone / දුරකථනයේ සුරැකිණි');
    } catch {
      setMessage('Could not save. This crate may already be recorded.');
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await fetch(API + '/auth/logout', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token },
      });
    } catch {
      setMessage('Signed out on this device. Revoke session when connected.');
    }
    setToken('');
    setUser(undefined);
    setLoads([]);
    setSelected(undefined);
    setGross(undefined);
  }
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 28, fontWeight: '700', color: '#175a39' }}>DaluMaga · දළුමඟ</Text>
      {!user ? (
        <>
          <Text style={{ fontSize: 22 }}>Staff sign in / සේවක පිවිසුම</Text>
          <Text>Username / පරිශීලක නාමය</Text>
          <TextInput
            accessibilityLabel="Username / පරිශීලක නාමය"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
            style={{ borderWidth: 1, padding: 12, minHeight: 48 }}
          />
          <Text>Password / මුරපදය</Text>
          <TextInput
            accessibilityLabel="Password / මුරපදය"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            style={{ borderWidth: 1, padding: 12, minHeight: 48 }}
          />
          <Button title="Sign in / පිවිසෙන්න" disabled={!db || busy} onPress={() => void login()} />
        </>
      ) : (
        <>
          <Text style={{ fontSize: 20 }}>
            {user.displayName} ·{' '}
            {user.roles.includes('weigher')
              ? 'Pickup / එකතු කිරීම'
              : 'Factory receipt / කම්හලේ භාරගැනීම'}
          </Text>
          <Text>SIMULATED SCALE / ආදර්ශ තරාදිය</Text>
          {loads.length === 0 ? (
            <Text>No assigned crates / පැවරූ පෙට්ටි නැත</Text>
          ) : (
            loads.map((load) => (
              <Button
                key={load.loadId}
                title={
                  (load.loadId === selected?.loadId ? '✓ ' : '') +
                  load.crateCode +
                  (load.recorded ? ' · recorded' : '')
                }
                disabled={load.recorded}
                onPress={() => {
                  setSelected(load);
                  setGross(undefined);
                }}
              />
            ))
          )}
          <Button
            title="Read simulated scale / තරාදිය කියවන්න"
            disabled={!selected || busy}
            onPress={() => void measure()}
          />
          <Text>Gross / මුළු බර: {gross === undefined ? '—' : gross / 1000} kg</Text>
          <Text>Tare / හිස් බර: {selected?.tareKg ?? '—'} kg</Text>
          <Text style={{ fontSize: 22 }}>
            Net / ශුද්ධ බර:{' '}
            {gross === undefined || !selected
              ? '—'
              : (gross / 1000 - Number(selected.tareKg)).toFixed(3)}{' '}
            kg
          </Text>
          <Button
            title="Save weight / බර සුරකින්න"
            disabled={gross === undefined || busy}
            onPress={() => void save()}
          />
          <Text>
            {pending} pending / යැවීමට {pending}ක් · {problems} need attention
          </Text>
          <Button title="Sync / යවන්න" disabled={busy} onPress={() => void sync()} />
          <Button title="Sign out / ඉවත් වන්න" disabled={busy} onPress={() => void logout()} />
        </>
      )}
      <Text accessibilityLiveRegion="polite">{message}</Text>
    </ScrollView>
  );
}

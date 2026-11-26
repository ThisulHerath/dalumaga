import { SimulatedScale } from '@dalumaga/shared';
import { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  listStaffPending,
  openStaffQueue,
  staffIssues,
  storeStaffReading,
  syncStaff,
  SessionInvalidError,
  recordedLoads,
} from './src/staff-queue';
import {
  deviceFor,
  removeOfflineSession,
  saveOfflineSession,
  unlockOfflineSession,
} from './src/staff-device';
import type { DeviceIdentity } from './src/staff-device';
import { fetchWithTimeout } from './src/network';
import { matchCrate } from './src/crate-match';
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
  const [device, setDevice] = useState<DeviceIdentity>();
  const [expiresAt, setExpiresAt] = useState('');
  const [captureUnlocked, setCaptureUnlocked] = useState(false);
  const [loads, setLoads] = useState<Load[]>([]),
    [selected, setSelected] = useState<Load>();
  const [gross, setGross] = useState<number>(),
    [pending, setPending] = useState(0),
    [problems, setProblems] = useState(0);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [crateInput, setCrateInput] = useState('');
  const scanHandled = useRef(false);
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
      const session = (await response.json()) as {
        token: string;
        user: Identity;
        expiresAt: string;
      };
      if (!session.user.roles.some((role) => ['weigher', 'receiver'].includes(role)))
        throw new Error('Field account required');
      const currentDevice = await deviceFor(session.user.id);
      const enrollment = await fetch(API + '/auth/devices/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.token },
        body: JSON.stringify({ ...currentDevice, label: 'Field phone' }),
      });
      if (!enrollment.ok)
        throw new Error(
          'Device registration failed. Sign in on the office site to review devices.',
        );
      const manifest = await fetch(API + '/staff/loads', {
        headers: {
          authorization: 'Bearer ' + session.token,
          'x-device-secret': currentDevice.secret,
        },
      });
      if (!manifest.ok) throw new Error('Could not load assigned crates');
      const recorded = new Set(await recordedLoads(db, session.user.id));
      const list = ((await manifest.json()) as Load[]).map((load) => ({
        ...load,
        recorded: load.recorded || recorded.has(load.loadId),
      }));
      setPassword('');
      setUser(session.user);
      setToken(session.token);
      setDevice(currentDevice);
      setExpiresAt(session.expiresAt);
      setCaptureUnlocked(true);
      setLoads(list);
      setSelected(undefined);
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
    if (!db || !user || !token || !device || syncing.current) return;
    syncing.current = true;
    setBusy(true);
    try {
      const status = await fetchWithTimeout(API + '/auth/me', {
        headers: { authorization: 'Bearer ' + token, 'x-device-secret': device.secret },
      });
      if (status.status === 401)
        throw new SessionInvalidError('Session expired or device revoked. Sign in online.');
      if (!status.ok)
        throw new Error('Could not verify session; saved readings remain on the phone.');
      const verified = status.data as Identity;
      const stageRole = user.roles.includes('weigher') ? 'weigher' : 'receiver';
      if (verified.id !== user.id || !verified.roles.includes(stageRole))
        throw new SessionInvalidError('Staff access changed. Sign in online.');
      setCaptureUnlocked(true);
      await syncStaff(db, user.id, token, device.secret, API);
      await refresh(db, user.id);
      setMessage('Sync checked / යැවීම් පරීක්ෂා කළා');
    } catch (error) {
      await refresh(db, user.id);
      if (error instanceof SessionInvalidError) {
        setToken('');
        setUser(undefined);
        setDevice(undefined);
        setCaptureUnlocked(false);
        await removeOfflineSession().catch(() => undefined);
      }
      setMessage(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!token || !user || !db) return;
    void sync();
    const timer = setInterval(() => void sync(), 15000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [token, user, db, device]);
  async function measure() {
    if (!selected || !user || !captureUnlocked) return;
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
    if (!db || !user || !selected || gross === undefined || busy || !captureUnlocked) return;
    if (Date.now() >= Date.parse(expiresAt)) {
      setMessage('Session expired. Sign in online before recording.');
      return;
    }
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
      await fetchWithTimeout(API + '/auth/logout', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'x-device-secret': device?.secret ?? '' },
      });
    } catch {
      setMessage('Signed out on this device. Revoke session when connected.');
    }
    setToken('');
    setUser(undefined);
    setDevice(undefined);
    setCaptureUnlocked(false);
    setLoads([]);
    setSelected(undefined);
    setGross(undefined);
    await removeOfflineSession().catch(() => {
      setMessage('Signed out. Could not remove the saved session; reconnect to verify access.');
    });
  }
  async function enableOffline() {
    if (!user || !device || !token) return;
    try {
      await saveOfflineSession({ token, user, device, expiresAt, savedAt: Date.now(), loads });
      setMessage('Saved-session unlock enabled. Reconnect after restart before recording.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not enable offline unlock');
    }
  }
  async function unlockOffline() {
    if (!db || busy) return;
    setBusy(true);
    try {
      const saved = await unlockOfflineSession();
      const recorded = new Set(await recordedLoads(db, saved.user.id));
      const available = saved.loads.map((load) => ({
        ...load,
        recorded: load.recorded || recorded.has(load.loadId),
      }));
      setUser(saved.user);
      setToken(saved.token);
      setDevice(saved.device);
      setExpiresAt(saved.expiresAt);
      setCaptureUnlocked(false);
      setLoads(available);
      setSelected(undefined);
      await refresh(db, saved.user.id);
      setMessage('Saved session unlocked. Reconnect to verify before recording new weights.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not unlock offline');
    } finally {
      setBusy(false);
    }
  }
  function selectCrate(code: string) {
    setSelected(undefined);
    setGross(undefined);
    const match = matchCrate(code, loads);
    if (match.kind === 'match') {
      setSelected(match.load);
      setCrateInput(match.load.crateCode);
      setMessage('Crate selected / පෙට්ටිය තෝරා ඇත');
      return;
    }
    const messages = {
      empty: 'Enter a crate code / පෙට්ටි අංකය ඇතුළත් කරන්න',
      'not-found': 'Crate is not assigned / මෙම පෙට්ටිය පවරා නැත',
      recorded: 'Crate already recorded / පෙට්ටියේ බර දැනටමත් සටහන් කර ඇත',
      ambiguous: 'Code matches multiple loads. Contact the office / කාර්යාලය අමතන්න',
    };
    setMessage(messages[match.kind]);
  }
  async function openScanner() {
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission.granted) {
      setMessage(
        'Camera access denied. Enter the crate code below / කැමරාව වෙනුවට අංකය ඇතුළත් කරන්න',
      );
      return;
    }
    scanHandled.current = false;
    setScanning(true);
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
          <Button
            title="Unlock saved session / සුරැකි ගිණුම විවෘත කරන්න"
            disabled={!db || busy}
            onPress={() => void unlockOffline()}
          />
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
          <Text>Device / උපකරණය: {device?.id.slice(-8)}</Text>
          <Text
            style={{ fontSize: 18, fontWeight: '700', color: '#175a39' }}
            accessibilityLiveRegion="polite"
          >
            {pending} pending / යැවීමට {pending}ක් · {problems} need attention / ගැටලු {problems}
          </Text>
          {!captureUnlocked && (
            <Text>Reconnect to verify before recording / බර සටහන් කිරීමට නැවත සම්බන්ධ වන්න</Text>
          )}
          <Text style={{ fontSize: 20, fontWeight: '700' }}>
            1. Choose a crate / පෙට්ටිය තෝරන්න
          </Text>
          <Button
            title="Scan crate QR / පෙට්ටියේ QR කේතය කියවන්න"
            disabled={busy || scanning}
            onPress={() => void openScanner()}
          />
          {scanning && (
            <View>
              <Text>Point the camera at the crate label / කැමරාව පෙට්ටියේ කේතය වෙත යොමු කරන්න</Text>
              <CameraView
                style={{ height: 280, width: '100%' }}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (scanHandled.current) return;
                  scanHandled.current = true;
                  setScanning(false);
                  selectCrate(data);
                }}
              />
              <Button title="Cancel scan / අවලංගු කරන්න" onPress={() => setScanning(false)} />
            </View>
          )}
          <Text>Or enter crate code / හෝ පෙට්ටි අංකය ඇතුළත් කරන්න</Text>
          <TextInput
            accessibilityLabel="Crate code / පෙට්ටි අංකය"
            value={crateInput}
            onChangeText={setCrateInput}
            autoCapitalize="characters"
            style={{ borderWidth: 1, padding: 12, minHeight: 48 }}
          />
          <Button
            title="Find crate / පෙට්ටිය සොයන්න"
            disabled={busy}
            onPress={() => selectCrate(crateInput)}
          />
          <Text>Or choose from assigned crates / හෝ පවරා ඇති පෙට්ටියක් තෝරන්න</Text>
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
                onPress={() => selectCrate(load.crateCode)}
              />
            ))
          )}
          <Text style={{ fontSize: 18, fontWeight: '700' }}>
            Selected / තෝරාගත් පෙට්ටිය: {selected?.crateCode ?? '—'}
          </Text>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>
            2. Read and check / බර කියවා පරීක්ෂා කරන්න
          </Text>
          <Button
            title="Read simulated scale / තරාදිය කියවන්න"
            disabled={!selected || busy || !captureUnlocked}
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
            disabled={gross === undefined || busy || !captureUnlocked}
            onPress={() => void save()}
          />
          <Button title="Sync / යවන්න" disabled={busy} onPress={() => void sync()} />
          <Button
            title="Enable saved-session unlock / සුරැකි ගිණුම විවෘත කිරීම"
            disabled={busy}
            onPress={() => void enableOffline()}
          />
          <Button title="Sign out / ඉවත් වන්න" disabled={busy} onPress={() => void logout()} />
        </>
      )}
      <Text accessibilityLiveRegion="polite">{message}</Text>
    </ScrollView>
  );
}

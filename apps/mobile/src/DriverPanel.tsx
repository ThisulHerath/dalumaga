import { useCallback, useEffect, useState } from 'react';
import { Button, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { activeStop, driverPending, recordDriverEvent } from './driver-queue';
import type { DriverTrip, StopReason } from './driver-queue';
const reasons: { value: StopReason; label: string }[] = [
  { value: 'tea', label: 'Tea break / තේ විවේකය' },
  { value: 'toilet', label: 'Toilet / වැසිකිළිය' },
  { value: 'breakdown', label: 'Breakdown / වාහනය කැඩී ඇත' },
  { value: 'emergency', label: 'Emergency / හදිසි අවස්ථාව' },
];
export function DriverPanel({
  db,
  actor,
  trips,
  unlocked,
  busy,
  expiresAt,
  onUpdate,
}: {
  db: SQLiteDatabase;
  actor: string;
  trips: DriverTrip[];
  unlocked: boolean;
  busy: boolean;
  expiresAt: string;
  onUpdate: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<DriverTrip>();
  const [open, setOpen] = useState<{ id: string; reason: string } | null>(null);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(
    async (trip = selected) => {
      setPending(await driverPending(db, actor));
      setOpen(trip ? await activeStop(db, actor, trip) : null);
    },
    [db, actor, selected],
  );
  useEffect(() => {
    void refresh();
  }, [refresh, busy]);
  async function save(kind: 'stop' | 'resume', value: string) {
    if (!selected || !unlocked || saving) return;
    if (Date.now() >= Date.parse(expiresAt)) {
      setMessage('Session expired. Sign in online / නැවත පිවිසෙන්න');
      return;
    }
    setSaving(true);
    try {
      await recordDriverEvent(db, actor, selected.id, kind, value);
      await refresh();
      setMessage('Saved on phone / දුරකථනයේ සුරැකිණි');
    } catch {
      setMessage('Could not save. Please check the stop / විවේකය සුරැකීමට නොහැකි විය');
    } finally {
      setSaving(false);
    }
  }
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Driver trip / රියදුරු ගමන</Text>
      <Text>SIMULATOR ONLY / පරීක්ෂණ සඳහා පමණි</Text>
      <Text>
        {pending} pending / යැවීමට {pending}ක්
      </Text>
      {!unlocked && (
        <Text>Reconnect to verify before recording / සටහන් කිරීමට නැවත සම්බන්ධ වන්න</Text>
      )}
      {trips.length === 0 ? (
        <Text>No assigned trips / පවරා ඇති ගමන් නැත</Text>
      ) : (
        trips.map((t) => (
          <Button
            key={t.id}
            title={(selected?.id === t.id ? '✓ ' : '') + t.route + ' · ' + t.vehicle}
            onPress={() => {
              setSelected(t);
              setMessage('');
            }}
          />
        ))
      )}
      {selected && (
        <>
          <Text style={{ fontSize: 19, fontWeight: '700' }}>Route / මාර්ගය: {selected.route}</Text>
          <Text>Vehicle / වාහනය: {selected.vehicle}</Text>
          <Text>Factory / කර්මාන්ත ශාලාව: {selected.factory}</Text>
          <Text>
            Pickup points / එකතු කරන ස්ථාන:{' '}
            {selected.pickupPoints.length
              ? selected.pickupPoints.join(', ')
              : 'Not configured / සකසා නැත'}
          </Text>
          <Text>
            Deadline / නියමිත වේලාව:{' '}
            {selected.deadline
              ? new Date(selected.deadline).toLocaleString()
              : 'Not configured / සකසා නැත'}
          </Text>
          {open ? (
            <>
              <Text style={{ fontSize: 19 }}>
                Stop reported / විවේකය:{' '}
                {reasons.find((r) => r.value === open.reason)?.label ?? open.reason}
              </Text>
              <Button
                title="End stop / නැවත ගමන් අරඹන්න"
                disabled={!unlocked || saving}
                onPress={() => void save('resume', open.id)}
              />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 18 }}>Choose a stop reason / විවේකයට හේතුව තෝරන්න</Text>
              {reasons.map((r) => (
                <Button
                  key={r.value}
                  title={r.label}
                  disabled={!unlocked || saving}
                  onPress={() => void save('stop', r.value)}
                />
              ))}
            </>
          )}
        </>
      )}
      <Text accessibilityLiveRegion="polite">{message}</Text>
      <Button title="Sync / යවන්න" disabled={busy || saving} onPress={() => void onUpdate()} />
    </View>
  );
}

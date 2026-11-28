import { locationAge } from './location-age';
import { useEffect, useState } from 'react';
const reasonLabels: Record<string, string> = {
  tea: 'Tea break / තේ විවේකය',
  toilet: 'Toilet / වැසිකිළිය',
  breakdown: 'Breakdown / වාහනය කැඩී ඇත',
  emergency: 'Emergency / හදිසි අවස්ථාව',
  other: 'Other / වෙනත්',
};
type Trip = {
  id: string;
  route: string;
  vehicle: string;
  deadline: string | null;
  lastFixAt: string | null;
  lastReceivedAt: string | null;
  locationSource: string | null;
  latitude: string | null;
  longitude: string | null;
  stopReason: string | null;
  stopAt: string | null;
  stopHistory: { id: string; reason: string; startedAt: string; endedAt: string | null }[];
};
export function DriverOffice({ api, token }: { api: string; token: string }) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch(api + '/driver/office', {
        headers: { authorization: 'Bearer ' + token },
      });
      if (!r.ok) throw Error('Unable to load trips / ගමන් පෙන්විය නොහැක');
      setTrips((await r.json()) as Trip[]);
      setMessage('');
    } catch (e) {
      setTrips(null);
      setMessage(e instanceof Error ? e.message : 'Unable to load trips');
    } finally {
      setBusy(false);
    }
  }
  async function simulate(tripId: string, sample: number) {
    setBusy(true);
    try {
      const r = await fetch(api + '/driver/simulate-position', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ tripId, sample }),
      });
      if (!r.ok) throw Error('Simulation failed / පරීක්ෂණය අසාර්ථකයි');
      const data = (await r.json()) as { signalGap: boolean };
      await refresh();
      if (data.signalGap) setMessage('Simulated signal gap: no new location / සංඥා නොමැත');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Driver trips / රියදුරු ගමන්</h2>
      <p>Simulator only: location points are test data / පරීක්ෂණ ස්ථාන දත්ත පමණි</p>
      <button type="button" disabled={busy} onClick={() => void refresh()}>
        Refresh trips / ගමන් යළි බලන්න
      </button>
      <p role="status">{message}</p>
      {trips === null ? (
        <p>Refresh to load trips / ගමන් බැලීමට යළි බලන්න</p>
      ) : trips.length === 0 ? (
        <p>No assigned trips / පැවරූ ගමන් නැත</p>
      ) : (
        trips.map((t) => (
          <article key={t.id}>
            <h3>
              {t.route} · {t.vehicle}
            </h3>
            <p>
              Deadline / නියමිත වේලාව:{' '}
              {t.deadline ? new Date(t.deadline).toLocaleString() : 'Not configured / සකසා නැත'}
            </p>
            <p>
              Last location fix / අවසන් ස්ථාන දත්ත:{' '}
              {t.lastFixAt
                ? new Date(t.lastFixAt).toLocaleString()
                : 'No location received / ස්ථාන දත්ත නැත'}
            </p>
            <p>{locationAge(t.lastFixAt, now)}</p>
            {t.lastFixAt && (
              <p>
                Source / මූලාශ්‍රය: {t.locationSource} · {t.latitude}, {t.longitude}
              </p>
            )}
            {t.lastReceivedAt && (
              <p>Received / ලැබුණු වේලාව: {new Date(t.lastReceivedAt).toLocaleString()}</p>
            )}
            <p>
              Driver-reported stop / රියදුරු දැන්වූ විවේකය:{' '}
              {t.stopReason
                ? (reasonLabels[t.stopReason] ?? t.stopReason)
                : 'None reported / වාර්තා කර නැත'}
            </p>
            {t.stopHistory.length > 0 && (
              <div>
                <strong>Reported stop history / වාර්තා කළ විවේක</strong>
                {t.stopHistory.map((stop) => (
                  <p key={stop.id}>
                    {reasonLabels[stop.reason] ?? stop.reason} ·{' '}
                    {new Date(stop.startedAt).toLocaleString()} ·{' '}
                    {stop.endedAt ? new Date(stop.endedAt).toLocaleString() : 'Open / පවතී'}
                  </p>
                ))}
              </div>
            )}
            <button type="button" disabled={busy} onClick={() => void simulate(t.id, 0)}>
              Start simulated route / පරීක්ෂණ මාර්ගය අරඹන්න
            </button>
            <button type="button" disabled={busy} onClick={() => void simulate(t.id, 1)}>
              Simulate signal gap / සංඥා නැතිවීම පරීක්ෂා කරන්න
            </button>
            <button type="button" disabled={busy} onClick={() => void simulate(t.id, 2)}>
              Next simulated location / ඊළඟ ස්ථානය පෙන්වන්න
            </button>
          </article>
        ))
      )}
    </section>
  );
}

import { locationAge } from './location-age';
import { assessDeadline } from './deadline-risk';
import type { SimulatedEstimate } from './deadline-risk';
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
const configuredAge = import.meta.env?.VITE_SIMULATOR_FIX_MAX_AGE_MINUTES;
const maxAgeMinutes = configuredAge === undefined ? 10 : Number(configuredAge);

function DeadlinePreview({
  trip,
  now,
  setNow,
}: {
  trip: Trip;
  now: number;
  setNow: (value: number) => void;
}) {
  const [minutes, setMinutes] = useState('');
  const [estimate, setEstimate] = useState<SimulatedEstimate | null>(null);
  const [error, setError] = useState('');
  const result = assessDeadline({
    deadline: trip.deadline,
    fixAt: trip.lastFixAt,
    source: trip.locationSource,
    estimate,
    now,
    maxAgeMinutes,
  });
  const reasons: Record<string, string> = {
    deadline: 'Deadline not configured / නියමිත වේලාව සකසා නැත',
    location: 'No valid location / ස්ථාන දත්ත නැත',
    source: 'A simulated location is required / පරීක්ෂණ ස්ථානයක් අවශ්‍යයි',
    'stale-location': 'Location is stale / ස්ථාන දත්ත පරණයි',
    clock: 'Check the location and computer clocks / වේලාව පරීක්ෂා කරන්න',
    estimate: 'Enter a simulated travel time / පරීක්ෂණ ගමන් කාලය ඇතුළත් කරන්න',
    'changed-location': 'Location changed; enter a new estimate / නව ඇස්තමේන්තුවක් ඇතුළත් කරන්න',
    'stale-estimate': 'Estimate is out of date / ඇස්තමේන්තුව පරණයි',
    configuration: 'Freshness setting is invalid / කාල සීමාව වැරදියි',
  };
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(minutes);
    if (!minutes.trim() || !Number.isInteger(value) || value < 0 || value > 720) {
      setError('Enter whole minutes from 0 to 720 / මිනිත්තු 0 සිට 720 දක්වා ඇතුළත් කරන්න');
      return;
    }
    if (!trip.lastFixAt) {
      setError('A simulated location is needed first / මුලින් පරීක්ෂණ ස්ථානයක් අවශ්‍යයි');
      return;
    }
    const createdAt = Date.now();
    setNow(createdAt);
    setEstimate({ minutes: value, createdAt, fixAt: trip.lastFixAt });
    setError('');
  }
  return (
    <div>
      <h4>Simulated arrival preview / පරීක්ෂණ පැමිණීම</h4>
      <p>
        Enter a test estimate for all remaining travel and stops. This is not a live routing
        prediction or a sent alert.
      </p>
      <p>
        ඉතිරි ගමන සහ විවේක සඳහා පරීක්ෂණ කාලයක් ඇතුළත් කරන්න. මෙය සජීවී අනාවැකියක් හෝ යැවූ අනතුරු
        ඇඟවීමක් නොවේ.
      </p>
      <form onSubmit={submit}>
        <label>
          Remaining minutes / ඉතිරි මිනිත්තු{' '}
          <input
            type="number"
            min="0"
            max="720"
            step="1"
            value={minutes}
            onChange={(event) => {
              setMinutes(event.target.value);
              setEstimate(null);
              setError('');
            }}
          />
        </label>
        <button type="submit">Preview / පෙරදසුන</button>
      </form>
      <p role="status">{error}</p>
      <p aria-live="polite">
        {result.kind === 'unknown'
          ? `Estimate unavailable / ඇස්තමේන්තුව නොමැත: ${reasons[result.reason]}`
          : result.kind === 'overdue'
            ? 'Earliest open deadline has passed / නියමිත වේලාව පසු වී ඇත'
            : result.kind === 'at-risk'
              ? `SIMULATED RISK / පරීක්ෂණ අවදානම: ${new Date(result.eta).toLocaleString()} · ${result.delayMinutes} min late`
              : `Simulated arrival before or at deadline / නියමිත වේලාවට පෙර: ${new Date(result.eta).toLocaleString()}`}
      </p>
      <p>
        Preview stays on this screen only. Freshness limit / දත්ත කාල සීමාව:{' '}
        {Number.isFinite(maxAgeMinutes) && maxAgeMinutes > 0 && maxAgeMinutes <= 1440
          ? `${maxAgeMinutes} min`
          : 'invalid / වැරදියි'}
        .
      </p>
    </div>
  );
}
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
      setNow(Date.now());
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
              Earliest open batch deadline / ආසන්නතම නියමිත වේලාව:{' '}
              {t.deadline ? new Date(t.deadline).toLocaleString() : 'Not configured / සකසා නැත'}
            </p>
            <DeadlinePreview trip={t} now={now} setNow={setNow} />
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

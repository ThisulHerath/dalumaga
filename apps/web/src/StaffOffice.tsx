import { useState } from 'react';
type Identity = { displayName: string; roles: string[] };
type Device = { id: string; label: string; enrolledAt: string; revokedAt: string | null };
type Row = {
  loadId: string;
  crateCode: string;
  pickupKg: string | null;
  receiptKg: string | null;
  differenceKg: string | null;
};
const api = import.meta.env?.VITE_API_URL || 'http://localhost:3000/v1';
export function StaffOffice() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [user, setUser] = useState<Identity>();
  const [rows, setRows] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [status, setStatus] = useState('');
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    try {
      const response = await fetch(api + '/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error('Sign in failed');
      const session = (await response.json()) as { token: string; user: Identity };
      setPassword('');
      setToken(session.token);
      setUser(session.user);
      setStatus('');
      if (session.user.roles.includes('dispatcher')) await refresh(session.token);
      await loadDevices(session.token);
    } catch (error) {
      setPassword('');
      setStatus(error instanceof Error ? error.message : 'Sign in failed');
    }
  }
  async function loadDevices(currentToken = token) {
    try {
      const response = await fetch(api + '/auth/devices', {
        headers: { authorization: 'Bearer ' + currentToken },
      });
      if (!response.ok) throw new Error('Could not load devices.');
      setDevices((await response.json()) as Device[]);
    } catch {
      setDevices(null);
      setStatus('Could not load devices.');
    }
  }
  async function revokeDevice(id: string) {
    if (!window.confirm('Revoke this device? / මෙම දුරකථනයේ ප්‍රවේශය නවත්වන්නද?')) return;
    try {
      const response = await fetch(api + '/auth/devices/' + id + '/revoke', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token },
      });
      if (!response.ok) throw new Error('Could not revoke device.');
      setStatus('Device revoked. The phone will be rejected when it reconnects.');
      await loadDevices();
    } catch {
      setStatus('Could not revoke device.');
    }
  }
  async function refresh(currentToken = token) {
    try {
      const response = await fetch(api + '/staff/comparisons', {
        headers: { authorization: 'Bearer ' + currentToken },
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Session expired. Sign in again.'
            : 'Could not load deliveries.',
        );
      setRows((await response.json()) as Row[]);
      setStatus('');
    } catch (error) {
      setRows([]);
      setStatus(error instanceof Error ? error.message : 'Could not load deliveries.');
    }
  }
  async function logout() {
    try {
      await fetch(api + '/auth/logout', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token },
      });
    } finally {
      setToken('');
      setUser(undefined);
      setRows([]);
      setDevices(null);
    }
  }
  if (!token)
    return (
      <form onSubmit={(event) => void signIn(event)}>
        <h2>Staff sign in / සේවක පිවිසුම</h2>
        <label>
          Username / පරිශීලක නාමය
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password / මුරපදය
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit">Sign in / පිවිසෙන්න</button>
        <p role="status">{status}</p>
      </form>
    );
  return (
    <section>
      <h2>
        {user?.roles.includes('dispatcher') ? 'Deliveries / දළු භාරදීම්' : 'My account / මගේ ගිණුම'}
      </h2>
      <p>{user?.displayName}</p>
      {user?.roles.includes('dispatcher') && (
        <button onClick={() => void refresh()}>Refresh / යළි බලන්න</button>
      )}
      <button onClick={() => void logout()}>Sign out / ඉවත් වන්න</button>
      <p role="status">{status}</p>
      {user?.roles.includes('dispatcher') &&
        (rows.length === 0 ? (
          <p>No deliveries available / දළු තොග නැත</p>
        ) : (
          rows.map((row) => (
            <article key={row.loadId}>
              <h3>{row.crateCode}</h3>
              <p>
                Pickup / එකතු කළ බර:{' '}
                {row.pickupKg === null ? 'Awaiting / බලා සිටී' : row.pickupKg + ' kg'}
              </p>
              <p>
                Factory / කම්හලේ බර:{' '}
                {row.receiptKg === null ? 'Awaiting / බලා සිටී' : row.receiptKg + ' kg'}
              </p>
              <p>
                Difference / වෙනස:{' '}
                {row.differenceKg === null
                  ? 'Pending / බලා සිටී'
                  : Number(row.differenceKg) < 0
                    ? Math.abs(Number(row.differenceKg)) + ' kg less at receipt'
                    : row.differenceKg + ' kg'}
              </p>
            </article>
          ))
        ))}
      <h2>My devices / මගේ උපකරණ</h2>
      <button onClick={() => void loadDevices()}>Refresh devices / උපකරණ යළි බලන්න</button>
      {devices === null ? (
        <p>Device list unavailable / උපකරණ ලැයිස්තුව නොමැත</p>
      ) : devices.length === 0 ? (
        <p>No registered devices / ලියාපදිංචි උපකරණ නැත</p>
      ) : (
        devices.map((device) => (
          <article key={device.id}>
            <p>
              {device.label} · {device.id.slice(-8)}
            </p>
            <p>{device.revokedAt ? 'Revoked / ප්‍රවේශය නවතා ඇත' : 'Active / සක්‍රියයි'}</p>
            {!device.revokedAt && (
              <button onClick={() => void revokeDevice(device.id)}>
                Revoke device / ප්‍රවේශය නවත්වන්න
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}

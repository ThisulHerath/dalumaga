import { useState } from 'react';
type Identity = { displayName: string; roles: string[] };
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
      if (!session.user.roles.includes('dispatcher')) {
        await fetch(api + '/auth/logout', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + session.token },
        });
        throw new Error('Dispatcher account required');
      }
      setToken(session.token);
      setUser(session.user);
      setStatus('');
      await refresh(session.token);
    } catch (error) {
      setPassword('');
      setStatus(error instanceof Error ? error.message : 'Sign in failed');
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
      <h2>Deliveries / දළු භාරදීම්</h2>
      <p>{user?.displayName}</p>
      <button onClick={() => void refresh()}>Refresh / යළි බලන්න</button>
      <button onClick={() => void logout()}>Sign out / ඉවත් වන්න</button>
      <p role="status">{status}</p>
      {rows.length === 0 ? (
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
      )}
    </section>
  );
}

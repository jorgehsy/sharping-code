import { useState, type FormEvent } from 'react';
import { useApp, useGame } from './context.ts';

export function Home() {
  const { controller } = useApp();
  const error = useGame((s) => s.actionError);
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const nick = nickname.trim();
  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    if (nick && code.trim()) void run(() => controller.join(code.trim().toUpperCase(), nick));
  };

  return (
    <main className="center">
      <h1>Sharping Code</h1>
      <form onSubmit={submitJoin} className="stack">
        <label>
          Apodo
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} autoFocus />
        </label>
        <button type="button" disabled={busy || !nick} onClick={() => void run(() => controller.create(nick))}>
          Crear partida
        </button>
        <hr />
        <label>
          Código de partida
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} />
        </label>
        <button type="submit" disabled={busy || !nick || !code.trim()}>
          Unirse
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { SubmitResponse, TasteResponse } from '@sharping/shared';
import { useApp, useGame } from './context.ts';
import { CodeEditor } from './CodeEditor.tsx';
import { Markdown } from './markdown.tsx';
import { difficultyLabel, ruleLabel } from '../kitchen/labels.ts';
import { isFull, MAX_DELIVERIES, nextPoints } from '../kitchen/points.ts';
import { createSessionStore } from '../session.ts';
import { formatClock, remainingMs } from '../store/time.ts';
import { useServerNow } from './ticker.ts';

const drafts = createSessionStore(globalThis.localStorage);

export const stubFor = (signature: string) => `${signature} {\n  // TODO\n}\n`;

export default function EditorView({ onBack }: { onBack: () => void }) {
  const taken = useGame((s) => s.taken);
  if (!taken) {
    return (
      <div className="center">
        <p>No hay ninguna comanda en curso.</p>
        <button onClick={onBack}>Volver a la cocina</button>
      </div>
    );
  }
  // key: remount (fresh model + draft) when switching orders.
  return <Cooking key={taken.orderId} onBack={onBack} />;
}

function Cooking({ onBack }: { onBack: () => void }) {
  const { controller } = useApp();
  const taken = useGame((s) => s.taken)!;
  const code = useGame((s) => s.code)!;
  const order = useGame((s) => s.orders.find((o) => o.orderId === taken.orderId));
  const rush = useGame((s) => s.rush);
  const now = useServerNow();
  const left = order ? remainingMs(order.expiresAt, now) : 0;
  const full = !!order && isFull(order);
  const open = !!order && left > 0 && !full;
  const submitting = useGame((s) => s.submitting);
  const last = useGame((s) => s.lastSubmit);
  const tasting = useGame((s) => s.tasting);
  const taste = useGame((s) => s.tasteResult);
  const sabotage = useGame((s) => s.me?.sabotage ?? null);
  const error = useGame((s) => s.actionError);
  const [source, setSource] = useState(() => drafts.loadDraft(code, taken.orderId) ?? stubFor(taken.signature));
  // Updated on change, not on render: a shortcut pressed right after typing fires before React re-renders.
  const sourceRef = useRef(source);
  const onChange = (v: string) => {
    sourceRef.current = v;
    setSource(v);
  };

  useEffect(() => {
    drafts.saveDraft(code, taken.orderId, source);
  }, [code, taken.orderId, source]);

  const close = () => {
    controller.dropOrder();
    onBack();
  };

  const canSubmit = open && !submitting;
  const submit = () => canSubmit && void controller.submit(sourceRef.current);

  const canTaste = open && !tasting && !submitting;
  const doTaste = () => canTaste && void controller.taste(sourceRef.current);
  const tasteRef = useRef(doTaste);
  tasteRef.current = doTaste;

  // Ctrl/Cmd+Enter submits, Ctrl/Cmd+' tastes, also while Monaco has focus.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "'") {
        e.preventDefault();
        tasteRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="editor-view">
      <section className="statement">
        <h2>{taken.title}</h2>
        <p className="muted">
          {difficultyLabel(taken.difficulty)} - {taken.basePoints} pts
        </p>
        {sabotage && <p className="badge bad">Sabotaje activo: {ruleLabel(sabotage)}</p>}
        <Markdown source={taken.statement} />
        <h3>Ejemplos</h3>
        <ul className="plain">
          {taken.publicCases.map((c, i) => (
            <li key={i}>
              <code>{taken.signature.match(/function\s+(\w+)/)?.[1] ?? 'solve'}({c.input.map((a) => JSON.stringify(a)).join(', ')})</code>
              {' → '}
              <code>{JSON.stringify(c.output)}</code>
            </li>
          ))}
        </ul>
      </section>
      <section className="work">
        {order && (
          <div className="order-status">
            <span>
              Entregas {order.deliveredBy.length}/{MAX_DELIVERIES}
            </span>
            <span>{full ? 'Sin puntos' : `Próxima entrega: ${nextPoints(order, rush)} pts`}</span>
            <span>Tiempo {formatClock(left)}</span>
          </div>
        )}
        {!open && (
          <div className="order-closed" role="alert">
            <span>
              {full
                ? `Esta comanda ya se completó (${MAX_DELIVERIES}/${MAX_DELIVERIES}). Entregarla no da puntos.`
                : 'Esta comanda está cerrada: el cliente se fue.'}
            </span>
            <button onClick={close}>Cerrar y elegir otra</button>
          </div>
        )}
        <div className="monaco">
          <CodeEditor path={taken.orderId} value={source} onChange={onChange} />
        </div>
        <div className="actions">
          <button disabled={!canSubmit} onClick={submit}>
            {submitting ? 'Entregando…' : 'Entregar (Ctrl+Enter)'}
          </button>
          <button disabled={!canTaste} onClick={doTaste}>
            {tasting ? 'Degustando…' : "Degustar (Ctrl+')"}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
        {taste?.orderId === taken.orderId && <Taste result={taste.result} />}
        {last?.orderId === taken.orderId && <Result result={last.result} />}
      </section>
    </div>
  );
}

const show = (v: unknown) => (v === undefined ? 'undefined' : JSON.stringify(v));

export function Result({ result }: { result: SubmitResponse }) {
  if (result.passed) {
    return (
      <div className="result good">
        ¡Entregada! Puesto Nº{result.rank}, +{result.points} pts.
      </div>
    );
  }
  return (
    <div className="result bad">
      <strong>
        {result.reason === 'compile' ? 'Error de compilación' : result.hidden ? 'Falló un caso oculto' : `Falló (${result.reason})`}
      </strong>{' '}
      <span className="muted">penalización -{Math.abs(result.penalty)}</span>
      {result.message && <pre>{result.message}</pre>}
      {result.case && (
        <pre>
          {`entrada:  ${show(result.case.input)}\nesperado: ${show(result.case.expected)}\nobtenido: ${show(result.case.actual)}`}
        </pre>
      )}
    </div>
  );
}

export function Taste({ result }: { result: TasteResponse }) {
  return (
    <div className="result">
      {result.ok ? (
        <table>
          <thead>
            <tr>
              <th>entrada</th>
              <th>esperado</th>
              <th>obtenido</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {result.cases.map((c, i) => (
              <tr key={i}>
                <td>{c.input.map(show).join(', ')}</td>
                <td>{show(c.expected)}</td>
                <td>{c.error !== undefined ? <span className="error">{c.error}</span> : show(c.actual)}</td>
                <td>{c.passed ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="error">
          <strong>{result.reason}</strong>: {result.message}
        </p>
      )}
      <p className="muted">Pasar los casos públicos no garantiza pasar los casos ocultos.</p>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { SubmitResponse } from '@sharping/shared';
import { useApp, useGame } from './context.ts';
import { CodeEditor } from './CodeEditor.tsx';
import { Markdown } from './markdown.tsx';
import { createSessionStore } from '../session.ts';

const drafts = createSessionStore(globalThis.localStorage);

export const stubFor = (signature: string) => `${signature} {\n  // TODO\n}\n`;

export default function EditorView({ onBack }: { onBack: () => void }) {
  const taken = useGame((s) => s.taken);
  if (!taken) {
    return (
      <div className="center">
        <p>No order in progress.</p>
        <button onClick={onBack}>Back to the kitchen</button>
      </div>
    );
  }
  // key: remount (fresh model + draft) when switching orders.
  return <Cooking key={taken.orderId} />;
}

function Cooking() {
  const { controller } = useApp();
  const taken = useGame((s) => s.taken)!;
  const code = useGame((s) => s.code)!;
  const open = useGame((s) => s.orders.some((o) => o.orderId === taken.orderId));
  const submitting = useGame((s) => s.submitting);
  const last = useGame((s) => s.lastSubmit);
  const sabotage = useGame((s) => s.me?.sabotage ?? null);
  const error = useGame((s) => s.actionError);
  const [source, setSource] = useState(() => drafts.loadDraft(code, taken.orderId) ?? stubFor(taken.signature));
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    drafts.saveDraft(code, taken.orderId, source);
  }, [code, taken.orderId, source]);

  const canSubmit = open && !submitting;
  const submit = () => canSubmit && void controller.submit(sourceRef.current);

  // Ctrl/Cmd+Enter submits, also while Monaco has focus.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitRef.current();
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
          {taken.difficulty} - {taken.basePoints} pts
        </p>
        {sabotage && <p className="badge bad">Sabotage active: {sabotage}</p>}
        <Markdown source={taken.statement} />
        <h3>Examples</h3>
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
        <div className="monaco">
          <CodeEditor path={taken.orderId} value={source} onChange={setSource} />
        </div>
        <div className="actions">
          <button disabled={!canSubmit} onClick={submit}>
            {submitting ? 'Submitting…' : 'Submit (Ctrl+Enter)'}
          </button>
          {!open && <span className="error">This order is closed.</span>}
          {error && <span className="error">{error}</span>}
        </div>
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
        Delivered! Rank #{result.rank}, +{result.points} pts.
      </div>
    );
  }
  return (
    <div className="result bad">
      <strong>
        {result.reason === 'compile' ? 'Compile error' : result.hidden ? 'Failed a hidden case' : `Failed (${result.reason})`}
      </strong>{' '}
      <span className="muted">penalty -{Math.abs(result.penalty)}</span>
      {result.message && <pre>{result.message}</pre>}
      {result.case && (
        <pre>
          {`input:    ${show(result.case.input)}\nexpected: ${show(result.case.expected)}\nactual:   ${show(result.case.actual)}`}
        </pre>
      )}
    </div>
  );
}

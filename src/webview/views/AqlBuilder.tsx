import { useEffect, useRef, useState } from 'react';
import type { AqlRange } from '../../shared/aql';
import { AqlEditor } from '../components/AqlEditor';
import { ResultsGrid } from '../components/ResultsGrid';
import { getPersistedState, onMessage, postMessage, setPersistedState } from '../utils/vscode';

const DEFAULT_QUERY = `items.find({
  "repo": "my-local-repo",
  "name": {"$match": "*.jar"}
}).include("name", "repo", "path", "created").limit(50)`;

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; requestId: number }
  | { kind: 'error'; message: string; errorKind: string }
  | { kind: 'done'; rows: Record<string, unknown>[]; range?: AqlRange; elapsedMs: number };

export function AqlBuilder() {
  const [query, setQuery] = useState(() => getPersistedState()?.query ?? DEFAULT_QUERY);
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  // undefined = not configured, null = not known yet.
  const [baseUrl, setBaseUrl] = useState<string | undefined | null>(null);
  const nextRequestId = useRef(1);
  const activeRequestId = useRef<number | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onMessage((msg) => {
      switch (msg.type) {
        case 'connection':
          setBaseUrl(msg.baseUrl);
          break;
        case 'aqlResult':
          if (msg.requestId === activeRequestId.current) {
            activeRequestId.current = undefined;
            setRun({ kind: 'done', rows: msg.rows, range: msg.range, elapsedMs: msg.elapsedMs });
          }
          break;
        case 'aqlError':
          if (msg.requestId === activeRequestId.current) {
            activeRequestId.current = undefined;
            setRun({ kind: 'error', message: msg.message, errorKind: msg.kind });
          }
          break;
      }
    });
    postMessage({ type: 'ready' });
    return unsubscribe;
  }, []);

  useEffect(() => setPersistedState({ query }), [query]);

  const running = run.kind === 'running';

  function execute() {
    if (running || !query.trim() || !baseUrl) {
      return;
    }
    const requestId = nextRequestId.current++;
    activeRequestId.current = requestId;
    setRun({ kind: 'running', requestId });
    postMessage({ type: 'executeAql', requestId, query });
  }

  function cancel() {
    if (run.kind === 'running') {
      postMessage({ type: 'cancelAql', requestId: run.requestId });
    }
  }

  function clear() {
    setQuery('');
    setRun({ kind: 'idle' });
  }

  return (
    <div className="aql-builder">
      <div className="toolbar">
        {running ? (
          <button className="button secondary" onClick={cancel}>
            Cancel
          </button>
        ) : (
          <button
            className="button"
            onClick={execute}
            disabled={!query.trim() || !baseUrl}
            title="Execute (Ctrl/Cmd+Enter)"
          >
            ▶ Execute AQL
          </button>
        )}
        <button className="button secondary" onClick={clear} disabled={running}>
          Clear
        </button>
        <span className="spacer" />
        {baseUrl && <span className="muted">{baseUrl}</span>}
      </div>

      {baseUrl === undefined && (
        <div className="banner">
          No JFrog connection is configured.{' '}
          <button className="link" onClick={() => postMessage({ type: 'configure' })}>
            Configure connection
          </button>
        </div>
      )}

      <AqlEditor value={query} onChange={setQuery} onExecute={execute} />

      <ResultsPane run={run} />
    </div>
  );
}

function ResultsPane({ run }: { run: RunState }) {
  const rows = run.kind === 'done' ? run.rows : [];

  return (
    <section className="results">
      <header className="results-header">
        <span className="results-title">{resultsTitle(run)}</span>
        <span className="spacer" />
        <button
          className="icon-button"
          disabled={!rows.length}
          onClick={() => postMessage({ type: 'copyToClipboard', text: toJson(rows) })}
        >
          Copy JSON
        </button>
        <button
          className="icon-button"
          disabled={!rows.length}
          onClick={() => postMessage({ type: 'openJson', content: toJson(rows) })}
        >
          Open as JSON
        </button>
      </header>
      <div className="results-body">
        {run.kind === 'idle' && <p className="placeholder">Run a query to view results here.</p>}
        {run.kind === 'running' && <p className="placeholder">Executing AQL query…</p>}
        {run.kind === 'error' && (
          <div className="error" role="alert">
            {run.message}
            {run.errorKind === 'unauthorized' && (
              <>
                {' '}
                <button className="link" onClick={() => postMessage({ type: 'configure' })}>
                  Reconfigure connection
                </button>
              </>
            )}
          </div>
        )}
        {run.kind === 'done' &&
          (rows.length ? (
            <ResultsGrid rows={rows} />
          ) : (
            <p className="placeholder">The query returned no results.</p>
          ))}
      </div>
    </section>
  );
}

function resultsTitle(run: RunState): string {
  switch (run.kind) {
    case 'running':
      return 'Results (running…)';
    case 'error':
      return 'Results (error)';
    case 'done': {
      const total = run.range?.total ?? run.rows.length;
      const count = total === run.rows.length ? `${total}` : `${run.rows.length} of ${total}`;
      return `Results (${count}) · ${run.elapsedMs} ms`;
    }
    default:
      return 'Results';
  }
}

function toJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

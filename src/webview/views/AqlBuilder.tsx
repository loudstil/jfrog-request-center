import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { AqlRange } from '../../shared/aql';
import type { SavedQueryRef } from '../../shared/messages';
import { AqlEditor } from '../components/AqlEditor';
import { ResultsGrid } from '../components/ResultsGrid';
import {
  filterRows,
  getColumns,
  nextSort,
  type Row,
  type SortState,
  sortRows,
} from '../components/resultsModel';
import { SplitPane } from '../components/SplitPane';
import { getPersistedState, onMessage, postMessage, setPersistedState } from '../utils/vscode';

const DEFAULT_QUERY = `items.find({
  "repo": "my-local-repo",
  "name": {"$match": "*.jar"}
}).include("name", "repo", "path", "created").limit(50)`;

const DEFAULT_EDITOR_RATIO = 0.4;

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; requestId: number }
  | { kind: 'error'; message: string; errorKind: string }
  | { kind: 'done'; rows: Record<string, unknown>[]; range?: AqlRange; elapsedMs: number };

export function AqlBuilder() {
  const [initial] = useState(getPersistedState);
  const [query, setQuery] = useState(initial?.query ?? DEFAULT_QUERY);
  const [savedQuery, setSavedQuery] = useState<SavedQueryRef | undefined>(initial?.savedQuery);
  const [baseline, setBaseline] = useState(initial?.baseline ?? DEFAULT_QUERY);
  const [editorRatio, setEditorRatio] = useState(initial?.editorRatio ?? DEFAULT_EDITOR_RATIO);
  // The latest list of saved queries from the extension; undefined until it arrives.
  const [knownQueries, setKnownQueries] = useState<SavedQueryRef[] | undefined>(undefined);
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
        case 'loadQuery':
          setQuery(msg.query);
          setBaseline(msg.query);
          setSavedQuery(msg.savedQuery);
          setRun({ kind: 'idle' });
          break;
        case 'querySaved':
          setSavedQuery(msg.savedQuery);
          setBaseline(msg.query);
          break;
        case 'savedQueries':
          setKnownQueries(msg.queries);
          break;
      }
    });
    postMessage({ type: 'ready' });
    return unsubscribe;
  }, []);

  // Follow renames from the sidebar. If our saved query was deleted, keep the text as unsaved.
  useEffect(() => {
    if (!savedQuery || !knownQueries) {
      return;
    }
    const match = knownQueries.find((q) => q.id === savedQuery.id);
    if (!match) {
      setSavedQuery(undefined);
      setBaseline('');
    } else if (match.name !== savedQuery.name) {
      setSavedQuery(match);
    }
  }, [knownQueries, savedQuery]);

  const dirty = query !== baseline && (savedQuery !== undefined || query.trim() !== '');

  useEffect(
    () => setPersistedState({ query, savedQuery, baseline, editorRatio }),
    [query, savedQuery, baseline, editorRatio],
  );
  useEffect(
    () => postMessage({ type: 'editorState', savedQueryId: savedQuery?.id, dirty }),
    [savedQuery?.id, dirty],
  );

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

  function save(saveAs = false) {
    if (!query.trim()) {
      return;
    }
    postMessage({ type: 'saveQuery', query, savedQueryId: savedQuery?.id, saveAs });
  }

  /** Starts a fresh, unsaved query. */
  function clear() {
    setQuery('');
    setBaseline('');
    setSavedQuery(undefined);
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
        <button
          className="button secondary"
          onClick={() => save()}
          disabled={!query.trim()}
          title="Save (Ctrl/Cmd+S)"
        >
          Save
        </button>
        {savedQuery && (
          <button className="button secondary" onClick={() => save(true)} disabled={!query.trim()}>
            Save As…
          </button>
        )}
        <button
          className="button secondary"
          onClick={clear}
          disabled={running}
          title="Clear the editor and start a new query"
        >
          Clear
        </button>
        {savedQuery && (
          <span className="query-name" title={dirty ? 'Unsaved changes' : undefined}>
            {savedQuery.name}
            {dirty && <span aria-label="unsaved changes"> ●</span>}
          </span>
        )}
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

      <SplitPane
        top={<AqlEditor value={query} onChange={setQuery} onExecute={execute} onSave={save} />}
        bottom={<ResultsPane run={run} />}
        ratio={editorRatio}
        onRatioChange={setEditorRatio}
        defaultRatio={DEFAULT_EDITOR_RATIO}
        minTopPx={80}
        minBottomPx={100}
        label="Resize the editor and results"
      />
    </div>
  );
}

const NO_ROWS: readonly Row[] = [];

function ResultsPane({ run }: { run: RunState }) {
  const rows = run.kind === 'done' ? run.rows : NO_ROWS;
  // Sort and filter carry over between runs, so re-running a query keeps the same view.
  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filter, setFilter] = useState('');
  // Filtering large results can take a moment; keep typing responsive.
  const deferredFilter = useDeferredValue(filter);

  const columns = useMemo(() => getColumns(rows), [rows]);
  const filtered = useMemo(
    () => filterRows(rows, columns, deferredFilter),
    [rows, columns, deferredFilter],
  );
  const activeSort = sort && columns.includes(sort.column) ? sort : undefined;
  const visible = useMemo(() => sortRows(filtered, activeSort), [filtered, activeSort]);
  const isFiltered = visible.length !== rows.length;
  const shown = isFiltered ? `the ${visible.length} rows shown` : `all ${rows.length} rows`;

  return (
    <section className="results">
      <header className="results-header">
        <span className="results-title">{resultsTitle(run)}</span>
        {isFiltered && (
          <span className="muted">
            · {visible.length} of {rows.length} shown
          </span>
        )}
        <span className="spacer" />
        {rows.length > 0 && (
          <input
            className="filter-input"
            type="search"
            placeholder="Filter rows"
            aria-label="Filter rows"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
          />
        )}
        <button
          className="icon-button"
          disabled={!visible.length}
          title={`Copy ${shown} as JSON`}
          onClick={() => postMessage({ type: 'copyToClipboard', text: toJson(visible) })}
        >
          Copy JSON
        </button>
        <button
          className="icon-button"
          disabled={!visible.length}
          title={`Open ${shown} in a JSON editor tab`}
          onClick={() => postMessage({ type: 'openJson', content: toJson(visible) })}
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
        {run.kind === 'done' && !rows.length && (
          <p className="placeholder">The query returned no results.</p>
        )}
        {run.kind === 'done' && rows.length > 0 && !visible.length && (
          <p className="placeholder">No rows match “{deferredFilter.trim()}”.</p>
        )}
        {visible.length > 0 && (
          <ResultsGrid
            rows={visible}
            allRows={rows}
            columns={columns}
            sort={activeSort}
            onSortClick={(column) => setSort(nextSort(activeSort, column))}
          />
        )}
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

function toJson(rows: readonly Row[]): string {
  return JSON.stringify(rows, null, 2);
}

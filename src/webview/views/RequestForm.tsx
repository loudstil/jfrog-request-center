import { type KeyboardEvent, useEffect, useState } from 'react';
import { type Endpoint, type EndpointParam, isMutating } from '../../shared/endpoints';
import type { RequestOutcome } from '../../shared/messages';
import { buildRequest } from '../../shared/requestBuilder';
import { CodeEditor } from '../components/CodeEditor';
import { getPersistedState, onMessage, postMessage, setPersistedState } from '../utils/vscode';

interface FormState {
  values: Record<string, string>;
  body: string;
}

interface RequestPersistedState {
  endpoint?: Endpoint;
  /** Form values per endpoint id, so switching endpoints doesn't lose what was typed. */
  forms: Record<string, FormState>;
}

const EMPTY_FORM: FormState = { values: {}, body: '' };

export function RequestForm() {
  const [initial] = useState(getPersistedState<RequestPersistedState>);
  const [endpoint, setEndpoint] = useState<Endpoint | undefined>(initial?.endpoint);
  const [forms, setForms] = useState<Record<string, FormState>>(initial?.forms ?? {});
  const [outcome, setOutcome] = useState<RequestOutcome | undefined>(undefined);
  const [sending, setSending] = useState(false);
  // undefined = not configured, null = not known yet.
  const [baseUrl, setBaseUrl] = useState<string | undefined | null>(null);

  useEffect(() => {
    const unsubscribe = onMessage((msg) => {
      switch (msg.type) {
        case 'connection':
          setBaseUrl(msg.baseUrl);
          break;
        case 'showEndpoint':
          setEndpoint(msg.endpoint);
          setForms((current) =>
            current[msg.endpoint.id]
              ? current
              : {
                  ...current,
                  [msg.endpoint.id]: { values: {}, body: msg.endpoint.body?.example ?? '' },
                },
          );
          setOutcome(undefined);
          setSending(false);
          break;
        case 'requestOutcome':
          setSending(false);
          setOutcome(msg.outcome);
          break;
      }
    });
    postMessage({ type: 'ready' });
    return unsubscribe;
  }, []);

  useEffect(() => setPersistedState<RequestPersistedState>({ endpoint, forms }), [endpoint, forms]);

  if (!endpoint) {
    return (
      <p className="placeholder">Select an endpoint in the JFrog Request Center API Explorer.</p>
    );
  }

  const form = forms[endpoint.id] ?? EMPTY_FORM;
  const updateForm = (changes: Partial<FormState>) =>
    setForms((current) => ({
      ...current,
      [endpoint.id]: { ...(current[endpoint.id] ?? EMPTY_FORM), ...changes },
    }));
  const setValue = (name: string, value: string) =>
    updateForm({ values: { ...form.values, [name]: value } });

  const preview = buildRequest(endpoint, form.values, { keepPlaceholders: true });
  const missing = outcome?.kind === 'invalid' ? outcome.missing : [];
  const pathParams = endpoint.params.filter((p) => p.in === 'path');
  const queryParams = endpoint.params.filter((p) => p.in === 'query');
  const bodyLanguage = endpoint.body?.contentType.includes('json') ? 'json' : 'plaintext';

  function send() {
    if (!endpoint || sending || !baseUrl) {
      return;
    }
    setSending(true);
    setOutcome(undefined);
    postMessage({
      type: 'sendRequest',
      endpointId: endpoint.id,
      values: form.values,
      body: endpoint.body ? form.body : undefined,
    });
  }

  function onFormKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="request-form" onKeyDown={onFormKeyDown}>
      <div className="toolbar">
        <button
          className="button"
          onClick={send}
          disabled={sending || !baseUrl}
          title="Send (Ctrl/Cmd+Enter)"
        >
          {sending ? 'Sending…' : isMutating(endpoint) ? '▶ Send…' : '▶ Send'}
        </button>
        <OutcomeMessage outcome={outcome} />
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

      <div className="request-scroll">
        <header className="request-header">
          <h1>
            <span className={`method method-${endpoint.method.toLowerCase()}`}>
              {endpoint.method}
            </span>
            {endpoint.name}
          </h1>
          <code className="request-url" title="The request URL with the current values">
            {preview.ok ? `${baseUrl ?? ''}${preview.request.path}` : endpoint.path}
          </code>
          {endpoint.description && <p className="muted">{endpoint.description}</p>}
        </header>

        {pathParams.length > 0 && (
          <ParamSection
            title="Path parameters"
            params={pathParams}
            values={form.values}
            missing={missing}
            onChange={setValue}
          />
        )}
        {queryParams.length > 0 && (
          <ParamSection
            title="Query parameters"
            params={queryParams}
            values={form.values}
            missing={missing}
            onChange={setValue}
          />
        )}
        {!endpoint.params.length && !endpoint.body && (
          <p className="muted">This endpoint takes no parameters.</p>
        )}

        {endpoint.body && (
          <section className="request-section request-body">
            <h2>
              Body <span className="muted">{endpoint.body.contentType}</span>
            </h2>
            <CodeEditor
              value={form.body}
              onChange={(body) => updateForm({ body })}
              language={bodyLanguage}
              ariaLabel="Request body"
              onExecute={send}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function ParamSection({
  title,
  params,
  values,
  missing,
  onChange,
}: {
  title: string;
  params: EndpointParam[];
  values: Record<string, string>;
  missing: string[];
  onChange: (name: string, value: string) => void;
}) {
  return (
    <section className="request-section">
      <h2>{title}</h2>
      <div className="param-grid">
        {params.map((param) => {
          const id = `param-${param.in}-${param.name}`;
          const invalid = missing.includes(param.name);
          return (
            <div key={id} className={`param-row${invalid ? ' invalid' : ''}`}>
              <label htmlFor={id} className="param-name">
                {param.name}
                {param.required && !param.flag && (
                  <span className="required" title="Required">
                    {' '}
                    *
                  </span>
                )}
              </label>
              <div className="param-control">
                <ParamInput
                  id={id}
                  param={param}
                  value={values[param.name] ?? ''}
                  invalid={invalid}
                  onChange={(value) => onChange(param.name, value)}
                />
                {param.description && <div className="param-description">{param.description}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ParamInput({
  id,
  param,
  value,
  invalid,
  onChange,
}: {
  id: string;
  param: EndpointParam;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  if (param.flag) {
    return (
      <input
        id={id}
        type="checkbox"
        checked={param.required || value === 'true'}
        disabled={param.required}
        title={param.required ? 'Always sent: it selects what this endpoint returns' : undefined}
        onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
      />
    );
  }
  if (param.enum) {
    return (
      <select
        id={id}
        className="input"
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{param.required ? 'Select…' : '(not set)'}</option>
        {param.enum.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      className="input"
      type="text"
      value={value}
      placeholder={param.placeholder}
      aria-invalid={invalid}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function OutcomeMessage({ outcome }: { outcome: RequestOutcome | undefined }) {
  if (!outcome) {
    return null;
  }
  switch (outcome.kind) {
    case 'sent':
      return (
        <span className={`outcome ${outcome.ok ? 'outcome-ok' : 'outcome-error'}`}>
          {outcome.status} {outcome.statusText} · {outcome.elapsedMs} ms · response opened beside
        </span>
      );
    case 'invalid':
      return <span className="outcome outcome-error">Fill in: {outcome.missing.join(', ')}</span>;
    case 'notSent':
      return <span className="outcome muted">Not sent.</span>;
    case 'failed':
      return outcome.errorKind === 'cancelled' ? (
        <span className="outcome muted">Cancelled.</span>
      ) : (
        <span className="outcome outcome-error" role="alert">
          {outcome.message}
          {(outcome.errorKind === 'unauthorized' || outcome.errorKind === 'notConfigured') && (
            <>
              {' '}
              <button className="link" onClick={() => postMessage({ type: 'configure' })}>
                Configure connection
              </button>
            </>
          )}
        </span>
      );
  }
}

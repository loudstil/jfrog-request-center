import { postMessage } from '../utils/vscode';

/** The active server's name in a panel toolbar. Click to switch servers. */
export function ServerBadge({ name, url }: { name: string | undefined; url: string }) {
  return (
    <button
      className="server-badge"
      title={`${url}\nClick to switch servers`}
      onClick={() => postMessage({ type: 'switchServer' })}
    >
      <span className="server-badge-dot" aria-hidden="true" />
      {name ?? url}
    </button>
  );
}

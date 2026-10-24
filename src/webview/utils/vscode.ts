// Typed wrapper around the webview's postMessage bridge to the extension host.
import type { ExtensionToWebview, SavedQueryRef, WebviewToExtension } from '../../shared/messages';

interface VsCodeApi<State> {
  postMessage(message: unknown): void;
  getState(): State | undefined;
  setState(state: State): void;
}

declare function acquireVsCodeApi<State>(): VsCodeApi<State>;

/** State VS Code keeps for us while the panel is hidden or moved. */
export interface PersistedState {
  query: string;
  /** The saved query being edited, if any. */
  savedQuery?: SavedQueryRef;
  /** The text the query had when it was last saved or loaded; used to detect unsaved changes. */
  baseline?: string;
  /** Share of the height given to the editor; the results get the rest. */
  editorRatio?: number;
}

// acquireVsCodeApi may only be called once per webview.
const api = acquireVsCodeApi<PersistedState>();

export function postMessage(message: WebviewToExtension): void {
  api.postMessage(message);
}

export function onMessage(handler: (message: ExtensionToWebview) => void): () => void {
  const listener = (event: MessageEvent<ExtensionToWebview>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export function getPersistedState(): PersistedState | undefined {
  return api.getState();
}

export function setPersistedState(state: PersistedState): void {
  api.setState(state);
}

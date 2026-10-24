// Typed wrapper around the webview's postMessage bridge to the extension host.
import type { ExtensionToWebview, WebviewToExtension } from '../../shared/messages';

interface VsCodeApi<State> {
  postMessage(message: unknown): void;
  getState(): State | undefined;
  setState(state: State): void;
}

declare function acquireVsCodeApi(): VsCodeApi<unknown>;

// acquireVsCodeApi may only be called once per webview.
const api = acquireVsCodeApi();

export function postMessage(message: WebviewToExtension): void {
  api.postMessage(message);
}

export function onMessage(handler: (message: ExtensionToWebview) => void): () => void {
  const listener = (event: MessageEvent<ExtensionToWebview>) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** State VS Code keeps for a webview while its panel is hidden or moved. Each view has its own. */
export function getPersistedState<State>(): State | undefined {
  return api.getState() as State | undefined;
}

export function setPersistedState<State>(state: State): void {
  api.setState(state);
}

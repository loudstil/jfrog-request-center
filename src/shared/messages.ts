// The postMessage protocol between the extension host and the AQL Manager webview.
// Both sides import these types so they can't drift apart.
import type { AqlRange } from './aql';

/** Identifies a saved query without its text. */
export interface SavedQueryRef {
  id: string;
  name: string;
}

export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'configure' }
  | { type: 'executeAql'; requestId: number; query: string }
  | { type: 'cancelAql'; requestId: number }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'openJson'; content: string }
  /** Save to `savedQueryId`, or prompt for a name if it's missing or `saveAs` is set. */
  | { type: 'saveQuery'; query: string; savedQueryId: string | undefined; saveAs: boolean }
  /** Sent whenever the editor's saved query or unsaved-changes state changes. */
  | { type: 'editorState'; savedQueryId: string | undefined; dirty: boolean };

export type ExtensionToWebview =
  | { type: 'connection'; baseUrl: string | undefined }
  | {
      type: 'aqlResult';
      requestId: number;
      rows: Record<string, unknown>[];
      range: AqlRange | undefined;
      elapsedMs: number;
    }
  | { type: 'aqlError'; requestId: number; message: string; kind: string }
  /** Replace the editor content, e.g. when a saved query is opened from the sidebar. */
  | { type: 'loadQuery'; query: string; savedQuery: SavedQueryRef | undefined }
  | { type: 'querySaved'; query: string; savedQuery: SavedQueryRef }
  /** The current list of saved queries, so the webview can follow renames and deletions. */
  | { type: 'savedQueries'; queries: SavedQueryRef[] };

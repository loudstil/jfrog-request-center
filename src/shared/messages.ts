// The postMessage protocol between the extension host and the AQL Manager webview.
// Both sides import these types so they can't drift apart.
import type { AqlRange } from './aql';

export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'configure' }
  | { type: 'executeAql'; requestId: number; query: string }
  | { type: 'cancelAql'; requestId: number }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'openJson'; content: string };

export type ExtensionToWebview =
  | { type: 'connection'; baseUrl: string | undefined }
  | {
      type: 'aqlResult';
      requestId: number;
      rows: Record<string, unknown>[];
      range: AqlRange | undefined;
      elapsedMs: number;
    }
  | { type: 'aqlError'; requestId: number; message: string; kind: string };

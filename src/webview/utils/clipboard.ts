// The system clipboard, through the extension host. The browser's own clipboard isn't reliable in
// VS Code webviews (on macOS, Cmd+C/X/V never reach the page), but vscode.env.clipboard is.
import { onMessage, postMessage } from './vscode';

let nextRequestId = 1;
const pending = new Map<number, (text: string) => void>();

onMessage((msg) => {
  if (msg.type === 'clipboardText') {
    pending.get(msg.requestId)?.(msg.text);
    pending.delete(msg.requestId);
  }
});

export function writeClipboard(text: string): void {
  postMessage({ type: 'clipboardWrite', text });
}

export function readClipboard(): Promise<string> {
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    postMessage({ type: 'clipboardRead', requestId });
  });
}

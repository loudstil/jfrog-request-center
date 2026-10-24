import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

/** Which React view the shared webview bundle renders (see src/webview/App.tsx). */
export type WebviewView = 'aql' | 'request';

/** The HTML shell for our webview panels: strict CSP, the shared bundle, and the view to show. */
export function renderWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  view: WebviewView,
  title: string,
): string {
  const nonce = randomBytes(16).toString('base64');
  const asset = (file: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', file)).toString();
  const csp = [
    "default-src 'none'",
    // Monaco injects <style> elements at runtime (theme colors, decorations).
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `script-src 'nonce-${nonce}'`,
    // The Monaco worker script is fetched and then started from a blob: URL.
    `connect-src ${webview.cspSource}`,
    'worker-src blob:',
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset('webview.css')}">
  <title>${title}</title>
</head>
<body>
  <div id="root" data-view="${view}" data-monaco-worker-url="${asset('editor.worker.js')}"></div>
  <script nonce="${nonce}" src="${asset('webview.js')}"></script>
</body>
</html>`;
}

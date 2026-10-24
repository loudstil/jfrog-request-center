import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { ExtensionToWebview, WebviewToExtension } from '../../shared/messages';
import { errorMessage } from '../commands/connection';
import type { AuthService } from '../services/authService';
import { JFrogError, type JFrogClient } from '../services/jfrogClient';

/** The AQL Manager: a single webview panel in the main editor area. */
export class AqlPanel implements vscode.Disposable {
  static readonly viewType = 'jfrogRequestCenter.aqlManager';
  private static current: AqlPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly inFlight = new Map<number, AbortController>();

  static show(extensionUri: vscode.Uri, client: JFrogClient, auth: AuthService): void {
    if (AqlPanel.current) {
      AqlPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      AqlPanel.viewType,
      'AQL Manager',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
      },
    );
    AqlPanel.current = new AqlPanel(panel, extensionUri, client, auth);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly client: JFrogClient,
    private readonly auth: AuthService,
  ) {
    panel.webview.html = renderHtml(panel.webview, extensionUri);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((msg: WebviewToExtension) => void this.handleMessage(msg)),
      auth.onDidChange(() => void this.postConnection()),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private async handleMessage(msg: WebviewToExtension): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.postConnection();
        break;
      case 'configure':
        await vscode.commands.executeCommand('jfrogRequestCenter.configure');
        break;
      case 'executeAql':
        await this.executeAql(msg.requestId, msg.query);
        break;
      case 'cancelAql':
        this.inFlight.get(msg.requestId)?.abort();
        break;
      case 'copyToClipboard':
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.setStatusBarMessage('$(copy) Results copied to clipboard', 3000);
        break;
      case 'openJson': {
        const doc = await vscode.workspace.openTextDocument({
          language: 'json',
          content: msg.content,
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        break;
      }
    }
  }

  private async executeAql(requestId: number, query: string): Promise<void> {
    const controller = new AbortController();
    this.inFlight.set(requestId, controller);
    const started = Date.now();
    try {
      const response = await this.client.aql(query, controller.signal);
      this.post({
        type: 'aqlResult',
        requestId,
        rows: response.results ?? [],
        range: response.range,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      this.post({
        type: 'aqlError',
        requestId,
        message: errorMessage(err),
        kind: err instanceof JFrogError ? err.kind : 'unknown',
      });
    } finally {
      this.inFlight.delete(requestId);
    }
  }

  private async postConnection(): Promise<void> {
    const connection = await this.auth.getConnection();
    this.post({ type: 'connection', baseUrl: connection?.baseUrl });
  }

  private post(msg: ExtensionToWebview): void {
    void this.panel.webview.postMessage(msg);
  }

  dispose(): void {
    AqlPanel.current = undefined;
    this.inFlight.forEach((controller) => controller.abort());
    this.disposables.forEach((d) => d.dispose());
    this.panel.dispose();
  }
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
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
  <title>AQL Manager</title>
</head>
<body>
  <div id="root" data-monaco-worker-url="${asset('editor.worker.js')}"></div>
  <script nonce="${nonce}" src="${asset('webview.js')}"></script>
</body>
</html>`;
}

import * as vscode from 'vscode';
import type { Endpoint } from '../../shared/endpoints';
import type { ExtensionToWebview, WebviewToExtension } from '../../shared/messages';
import type { EndpointCatalog } from '../explorer/endpointCatalog';
import type { RequestExecutor } from '../explorer/requestExecutor';
import type { ServerManager } from '../services/serverManager';
import { handleClipboardMessage } from './clipboard';
import { renderWebviewHtml } from './webviewHtml';

export interface RequestPanelServices {
  servers: ServerManager;
  catalog: EndpointCatalog;
  executor: RequestExecutor;
}

const DEFAULT_TITLE = 'JFrog Request';

/** The request form for one API Explorer endpoint. A single panel is reused for all endpoints. */
export class RequestPanel implements vscode.Disposable {
  static readonly viewType = 'jfrogRequestCenter.request';
  private static current: RequestPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private endpoint: Endpoint | undefined;

  static show(extensionUri: vscode.Uri, services: RequestPanelServices, endpoint: Endpoint): void {
    if (!RequestPanel.current) {
      const panel = vscode.window.createWebviewPanel(
        RequestPanel.viewType,
        DEFAULT_TITLE,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
        },
      );
      RequestPanel.current = new RequestPanel(panel, extensionUri, services);
    }
    RequestPanel.current.showEndpoint(endpoint);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly services: RequestPanelServices,
  ) {
    panel.webview.html = renderWebviewHtml(panel.webview, extensionUri, 'request', DEFAULT_TITLE);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((msg: WebviewToExtension) => void this.handleMessage(msg)),
      services.servers.onDidChange(() => void this.postConnection()),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private showEndpoint(endpoint: Endpoint): void {
    this.endpoint = endpoint;
    this.panel.title = `${endpoint.method} ${endpoint.name}`;
    this.panel.reveal();
    if (this.ready) {
      this.post({ type: 'showEndpoint', endpoint });
    }
  }

  private async handleMessage(msg: WebviewToExtension): Promise<void> {
    if (await handleClipboardMessage(msg, (reply) => this.post(reply))) {
      return;
    }
    switch (msg.type) {
      case 'ready':
        this.ready = true;
        await this.postConnection();
        if (this.endpoint) {
          this.post({ type: 'showEndpoint', endpoint: this.endpoint });
        }
        break;
      case 'configure':
        await vscode.commands.executeCommand('jfrogRequestCenter.configure');
        break;
      case 'switchServer':
        await vscode.commands.executeCommand('jfrogRequestCenter.switchServer');
        break;
      case 'sendRequest': {
        const endpoint = this.services.catalog.get(msg.endpointId);
        const outcome = endpoint
          ? await this.services.executor.execute(endpoint, msg.values, msg.body)
          : {
              kind: 'failed' as const,
              message: 'This endpoint is no longer available. Refresh the API Explorer.',
              errorKind: 'unknown',
            };
        this.post({ type: 'requestOutcome', endpointId: msg.endpointId, outcome });
        break;
      }
    }
  }

  private async postConnection(): Promise<void> {
    const connection = await this.services.servers.getConnection();
    this.post({
      type: 'connection',
      baseUrl: connection?.baseUrl,
      serverName: connection?.name,
    });
  }

  private post(msg: ExtensionToWebview): void {
    void this.panel.webview.postMessage(msg);
  }

  dispose(): void {
    RequestPanel.current = undefined;
    this.disposables.forEach((d) => d.dispose());
    this.panel.dispose();
  }
}

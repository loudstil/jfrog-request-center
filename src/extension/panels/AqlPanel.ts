import * as vscode from 'vscode';
import type { ExtensionToWebview, WebviewToExtension } from '../../shared/messages';
import { errorMessage } from '../errors';
import { promptForQueryName, type QueryToLoad, toRef } from '../commands/savedQueries';
import type { ServerManager } from '../services/serverManager';
import { JFrogError, type JFrogClient } from '../services/jfrogClient';
import type { SavedQuery, SavedQueryStore } from '../services/savedQueryStore';
import { renderWebviewHtml } from './webviewHtml';

export interface AqlPanelServices {
  client: JFrogClient;
  servers: ServerManager;
  store: SavedQueryStore;
}

const DEFAULT_TITLE = 'AQL Manager';

/** The AQL Manager: a single webview panel in the main editor area. */
export class AqlPanel implements vscode.Disposable {
  static readonly viewType = 'jfrogRequestCenter.aqlManager';
  private static current: AqlPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly inFlight = new Map<number, AbortController>();
  private readonly client: JFrogClient;
  private readonly servers: ServerManager;
  private readonly store: SavedQueryStore;

  private ready = false;
  /** A query to show once the webview has loaded. */
  private pendingLoad: QueryToLoad | undefined;
  // Mirrors the webview's editor state (see the 'editorState' message).
  private savedQueryId: string | undefined;
  private dirty = false;

  /** Opens (or reveals) the AQL Manager, optionally replacing its content with `load`. */
  static async show(
    extensionUri: vscode.Uri,
    services: AqlPanelServices,
    load?: QueryToLoad,
  ): Promise<void> {
    if (!AqlPanel.current) {
      const panel = vscode.window.createWebviewPanel(
        AqlPanel.viewType,
        DEFAULT_TITLE,
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
        },
      );
      AqlPanel.current = new AqlPanel(panel, extensionUri, services);
    }
    const current = AqlPanel.current;
    if (load) {
      await current.load(load);
    } else {
      current.panel.reveal();
    }
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    services: AqlPanelServices,
  ) {
    ({ client: this.client, servers: this.servers, store: this.store } = services);
    panel.webview.html = renderWebviewHtml(panel.webview, extensionUri, 'aql', DEFAULT_TITLE);
    this.disposables.push(
      panel.webview.onDidReceiveMessage((msg: WebviewToExtension) => void this.handleMessage(msg)),
      this.servers.onDidChange(() => void this.postConnection()),
      this.store.onDidChange(() => {
        this.postSavedQueries();
        this.updateTitle();
      }),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private async load(load: QueryToLoad): Promise<void> {
    if (this.dirty) {
      const current = this.currentSavedQuery();
      const choice = await vscode.window.showWarningMessage(
        current
          ? `Discard unsaved changes to "${current.name}"?`
          : 'Discard the unsaved query in the AQL Manager?',
        { modal: true, detail: 'Opening another query replaces the editor content.' },
        'Discard Changes',
      );
      if (choice !== 'Discard Changes') {
        this.panel.reveal();
        return;
      }
    }
    this.panel.reveal();
    if (this.ready) {
      this.post({ type: 'loadQuery', ...load });
    } else {
      this.pendingLoad = load;
    }
  }

  private async handleMessage(msg: WebviewToExtension): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.ready = true;
        await this.postConnection();
        this.postSavedQueries();
        if (this.pendingLoad) {
          this.post({ type: 'loadQuery', ...this.pendingLoad });
          this.pendingLoad = undefined;
        }
        break;
      case 'editorState':
        this.savedQueryId = msg.savedQueryId;
        this.dirty = msg.dirty;
        this.updateTitle();
        break;
      case 'saveQuery':
        await this.saveQuery(msg.query, msg.savedQueryId, msg.saveAs);
        break;
      case 'configure':
        await vscode.commands.executeCommand('jfrogRequestCenter.configure');
        break;
      case 'switchServer':
        await vscode.commands.executeCommand('jfrogRequestCenter.switchServer');
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

  private async saveQuery(
    query: string,
    savedQueryId: string | undefined,
    saveAs: boolean,
  ): Promise<void> {
    const current = savedQueryId ? this.store.get(savedQueryId) : undefined;
    try {
      let saved: SavedQuery;
      if (current && !saveAs) {
        saved = await this.store.update(current.id, { query });
      } else {
        const name = await promptForQueryName(this.store, {
          title: saveAs ? 'Save Query As' : 'Save Query',
          value: current ? `${current.name} copy` : undefined,
        });
        if (!name) {
          return;
        }
        // The name prompt already warned that an existing query will be overwritten.
        const existing = this.store.findByName(name);
        saved = existing
          ? await this.store.update(existing.id, { query })
          : await this.store.create(name, query);
      }
      this.post({ type: 'querySaved', query, savedQuery: toRef(saved) });
      vscode.window.setStatusBarMessage(`$(check) Saved "${saved.name}"`, 3000);
    } catch (err) {
      vscode.window.showErrorMessage(`Could not save the query: ${errorMessage(err)}`);
    }
  }

  private currentSavedQuery(): SavedQuery | undefined {
    return this.savedQueryId ? this.store.get(this.savedQueryId) : undefined;
  }

  private updateTitle(): void {
    const saved = this.currentSavedQuery();
    this.panel.title = saved ? `${saved.name}${this.dirty ? ' ●' : ''}` : DEFAULT_TITLE;
  }

  private postSavedQueries(): void {
    this.post({ type: 'savedQueries', queries: this.store.list().map(toRef) });
  }

  private async postConnection(): Promise<void> {
    const connection = await this.servers.getConnection();
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
    AqlPanel.current = undefined;
    this.inFlight.forEach((controller) => controller.abort());
    this.disposables.forEach((d) => d.dispose());
    this.panel.dispose();
  }
}

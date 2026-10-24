import * as vscode from 'vscode';
import { errorMessage } from './errors';
import type { JFrogClient } from './services/jfrogClient';
import type { ServerManager } from './services/serverManager';

/** Shows the active server and whether it can be reached. Click to switch servers. */
export class ConnectionStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  private readonly subscription: vscode.Disposable;
  // Saving a server fires several change events; only the latest refresh may update the UI.
  private generation = 0;

  constructor(
    private readonly servers: ServerManager,
    private readonly client: JFrogClient,
  ) {
    this.item.name = 'JFrog Server';
    this.item.show();
    this.subscription = servers.onDidChange(() => void this.refresh());
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation;
    const server = this.servers.activeServer();
    const connection = await this.servers.getConnection();
    if (generation !== this.generation) {
      return;
    }

    if (!server) {
      this.update('$(plug) JFrog: Add Server', 'No JFrog server is configured', 'addServer');
      return;
    }
    if (!connection) {
      this.update(
        `$(key) ${server.name}`,
        `${server.url}\nNo access token. Click to switch servers or sign in.`,
        'switchServer',
      );
      return;
    }

    this.update(`$(sync~spin) ${server.name}`, `Connecting to ${server.url}…`, 'switchServer');
    try {
      const { version } = await this.client.version();
      if (generation === this.generation) {
        this.update(
          `$(server) ${server.name}`,
          `${server.url}\nArtifactory ${version}\nClick to switch servers`,
          'switchServer',
        );
      }
    } catch (err) {
      if (generation === this.generation) {
        this.update(
          `$(warning) ${server.name}`,
          `${server.url}\n${errorMessage(err)}\nClick to switch or edit servers`,
          'switchServer',
        );
      }
    }
  }

  private update(text: string, tooltip: string, command: string): void {
    this.item.text = text;
    this.item.tooltip = tooltip;
    this.item.command = `jfrogRequestCenter.${command}`;
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }
}

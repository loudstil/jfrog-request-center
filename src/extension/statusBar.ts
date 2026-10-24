import * as vscode from 'vscode';
import { errorMessage } from './commands/connection';
import type { AuthService } from './services/authService';
import type { JFrogClient } from './services/jfrogClient';

/** Shows whether we can reach Artifactory, and its version, in the status bar. */
export class ConnectionStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  private readonly subscription: vscode.Disposable;
  // Saving a connection fires several change events; only the latest refresh may update the UI.
  private generation = 0;

  constructor(
    private readonly auth: AuthService,
    private readonly client: JFrogClient,
  ) {
    this.item.name = 'JFrog Connection';
    this.item.show();
    this.subscription = auth.onDidChange(() => void this.refresh());
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation;
    const connection = await this.auth.getConnection();
    if (generation !== this.generation) {
      return;
    }

    if (!connection) {
      this.update('$(plug) JFrog: Not configured', 'Click to configure', 'configure');
      return;
    }

    this.update('$(sync~spin) JFrog', `Connecting to ${connection.baseUrl}…`, 'configure');
    try {
      const { version } = await this.client.version();
      if (generation === this.generation) {
        this.update(
          `$(check) Artifactory ${version}`,
          `Connected to ${connection.baseUrl}\nClick to open the AQL Manager`,
          'openAqlManager',
        );
      }
    } catch (err) {
      if (generation === this.generation) {
        this.update('$(warning) JFrog', `${errorMessage(err)}\nClick to reconfigure`, 'configure');
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

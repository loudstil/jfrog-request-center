import * as vscode from 'vscode';
import { clearCredentials, configureConnection } from './commands/connection';
import { AqlPanel } from './panels/AqlPanel';
import { AuthService } from './services/authService';
import { JFrogClient } from './services/jfrogClient';
import { ConnectionStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const auth = new AuthService(context.secrets);
  const client = new JFrogClient(() => auth.getConnection());
  const statusBar = new ConnectionStatusBar(auth, client);

  context.subscriptions.push(
    auth,
    statusBar,
    vscode.commands.registerCommand('jfrogRequestCenter.configure', () =>
      configureConnection(auth),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.clearCredentials', () =>
      clearCredentials(auth),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.openAqlManager', () =>
      AqlPanel.show(context.extensionUri, client, auth),
    ),
  );

  void statusBar.refresh();
}

export function deactivate(): void {}

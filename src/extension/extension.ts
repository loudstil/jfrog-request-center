import * as vscode from 'vscode';
import { clearCredentials, configureConnection } from './commands/connection';
import { type QueryToLoad, registerSavedQueryCommands } from './commands/savedQueries';
import { AqlPanel, type AqlPanelServices } from './panels/AqlPanel';
import { SavedQueriesProvider } from './providers/SavedQueriesProvider';
import { AuthService } from './services/authService';
import { JFrogClient } from './services/jfrogClient';
import { SAVED_QUERIES_KEY, SavedQueryStore } from './services/savedQueryStore';
import { ConnectionStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const auth = new AuthService(context.secrets);
  const client = new JFrogClient(() => auth.getConnection());
  const statusBar = new ConnectionStatusBar(auth, client);

  // Saved queries follow the user across workspaces and, with Settings Sync, across machines.
  context.globalState.setKeysForSync([SAVED_QUERIES_KEY]);
  const store = new SavedQueryStore(context.globalState);
  const savedQueriesProvider = new SavedQueriesProvider(store);

  const services: AqlPanelServices = { client, auth, store };
  const openAqlManager = (load?: QueryToLoad) =>
    AqlPanel.show(context.extensionUri, services, load);

  context.subscriptions.push(
    auth,
    statusBar,
    savedQueriesProvider,
    vscode.window.createTreeView('jfrogRequestCenter.savedQueries', {
      treeDataProvider: savedQueriesProvider,
    }),
    ...registerSavedQueryCommands(store, openAqlManager),
    vscode.commands.registerCommand('jfrogRequestCenter.configure', () =>
      configureConnection(auth),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.clearCredentials', () =>
      clearCredentials(auth),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.openAqlManager', () => openAqlManager()),
  );

  void statusBar.refresh();
}

export function deactivate(): void {}

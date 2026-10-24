import * as vscode from 'vscode';
import { registerApiExplorerCommands } from './commands/apiExplorer';
import { clearCredentials, configureConnection } from './commands/connection';
import { type QueryToLoad, registerSavedQueryCommands } from './commands/savedQueries';
import { EndpointCatalog } from './explorer/endpointCatalog';
import { RequestExecutor } from './explorer/requestExecutor';
import { RESPONSE_SCHEME, ResponseDocuments } from './explorer/responseDocuments';
import { AqlPanel, type AqlPanelServices } from './panels/AqlPanel';
import { RequestPanel } from './panels/RequestPanel';
import { ApiExplorerProvider } from './providers/ApiExplorerProvider';
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

  const catalog = new EndpointCatalog();
  const apiExplorerProvider = new ApiExplorerProvider(catalog);
  const responses = new ResponseDocuments();
  const executor = new RequestExecutor(client, responses, async () => {
    return (await auth.getConnection())?.baseUrl;
  });

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
    catalog,
    apiExplorerProvider,
    vscode.window.createTreeView('jfrogRequestCenter.apiExplorer', {
      treeDataProvider: apiExplorerProvider,
    }),
    vscode.workspace.registerTextDocumentContentProvider(RESPONSE_SCHEME, responses),
    ...registerApiExplorerCommands(catalog, executor, (endpoint) =>
      RequestPanel.show(context.extensionUri, { auth, catalog, executor }, endpoint),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.configure', () =>
      configureConnection(auth),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.clearCredentials', () =>
      clearCredentials(auth),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.openAqlManager', () => openAqlManager()),
  );

  void statusBar.refresh();
  void catalog.reload();
}

export function deactivate(): void {}

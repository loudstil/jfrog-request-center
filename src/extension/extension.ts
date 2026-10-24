import * as vscode from 'vscode';
import { registerApiExplorerCommands } from './commands/apiExplorer';
import { type QueryToLoad, registerSavedQueryCommands } from './commands/savedQueries';
import { registerServerCommands } from './commands/servers';
import { EndpointCatalog } from './explorer/endpointCatalog';
import { RequestExecutor } from './explorer/requestExecutor';
import { RESPONSE_SCHEME, ResponseDocuments } from './explorer/responseDocuments';
import { AqlPanel, type AqlPanelServices } from './panels/AqlPanel';
import { RequestPanel } from './panels/RequestPanel';
import { ApiExplorerProvider } from './providers/ApiExplorerProvider';
import { SavedQueriesProvider } from './providers/SavedQueriesProvider';
import { ServersProvider } from './providers/ServersProvider';
import { JFrogClient } from './services/jfrogClient';
import { SAVED_QUERIES_KEY, SavedQueryStore } from './services/savedQueryStore';
import { ServerManager } from './services/serverManager';
import { ConnectionStatusBar } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  // Request log (method, URL, status, timing) in the Output panel. Never contains credentials.
  const log = vscode.window.createOutputChannel('JFrog Request Center', { log: true });
  const servers = new ServerManager(context.secrets, context.globalState);
  const client = new JFrogClient(() => servers.getConnection(), { logger: log });
  const statusBar = new ConnectionStatusBar(servers, client);
  const serversProvider = new ServersProvider(servers);

  // Saved queries follow the user across workspaces and, with Settings Sync, across machines.
  context.globalState.setKeysForSync([SAVED_QUERIES_KEY]);
  const store = new SavedQueryStore(context.globalState);
  const savedQueriesProvider = new SavedQueriesProvider(store);

  const catalog = new EndpointCatalog();
  const apiExplorerProvider = new ApiExplorerProvider(catalog);
  const responses = new ResponseDocuments();
  const executor = new RequestExecutor(client, responses, () => servers.getConnection());

  const services: AqlPanelServices = { client, servers, store };
  const openAqlManager = (load?: QueryToLoad) =>
    AqlPanel.show(context.extensionUri, services, load);

  context.subscriptions.push(
    log,
    vscode.commands.registerCommand('jfrogRequestCenter.showLogs', () => log.show()),
    servers,
    statusBar,
    serversProvider,
    vscode.window.createTreeView('jfrogRequestCenter.servers', {
      treeDataProvider: serversProvider,
    }),
    ...registerServerCommands(servers, log),
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
      RequestPanel.show(context.extensionUri, { servers, catalog, executor }, endpoint),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.openAqlManager', () => openAqlManager()),
  );

  // Migrate first, so the status bar and panels see the migrated server.
  void servers.migrateLegacyConnection().finally(() => void statusBar.refresh());
  void catalog.reload();
}

export function deactivate(): void {}

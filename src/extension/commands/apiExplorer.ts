import * as vscode from 'vscode';
import { type Endpoint, needsNoInput } from '../../shared/endpoints';
import type { EndpointCatalog } from '../explorer/endpointCatalog';
import type { RequestExecutor } from '../explorer/requestExecutor';
import type { ApiExplorerNode } from '../providers/ApiExplorerProvider';

/** Tree clicks pass an endpoint id, context menus pass the node, the Command Palette nothing. */
type EndpointArg = string | ApiExplorerNode | undefined;

export function registerApiExplorerCommands(
  catalog: EndpointCatalog,
  executor: RequestExecutor,
  openRequestForm: (endpoint: Endpoint) => void,
): vscode.Disposable[] {
  return [
    // The ▶ action: send right away if nothing needs filling in, otherwise open the form.
    vscode.commands.registerCommand(
      'jfrogRequestCenter.executeRequest',
      async (arg: EndpointArg) => {
        const endpoint = await resolveEndpoint(catalog, arg, 'Send JFrog API request');
        if (!endpoint) {
          return;
        }
        if (!needsNoInput(endpoint)) {
          openRequestForm(endpoint);
          return;
        }
        const outcome = await executor.execute(endpoint, {}, undefined);
        if (outcome.kind === 'failed' && outcome.errorKind !== 'cancelled') {
          const authProblem =
            outcome.errorKind === 'notConfigured' || outcome.errorKind === 'unauthorized';
          const choice = await vscode.window.showErrorMessage(
            `${endpoint.name}: ${outcome.message}`,
            ...(authProblem ? ['Configure Connection'] : []),
            'Show Logs',
          );
          if (choice === 'Configure Connection') {
            await vscode.commands.executeCommand('jfrogRequestCenter.configure');
          } else if (choice === 'Show Logs') {
            await vscode.commands.executeCommand('jfrogRequestCenter.showLogs');
          }
        }
      },
    ),
    vscode.commands.registerCommand(
      'jfrogRequestCenter.openRequestForm',
      async (arg: EndpointArg) => {
        const endpoint = await resolveEndpoint(catalog, arg, 'Open request form');
        if (endpoint) {
          openRequestForm(endpoint);
        }
      },
    ),
    vscode.commands.registerCommand(
      'jfrogRequestCenter.copyEndpointPath',
      async (arg: EndpointArg) => {
        const endpoint = await resolveEndpoint(catalog, arg, 'Copy endpoint path');
        if (endpoint) {
          await vscode.env.clipboard.writeText(endpoint.path);
          vscode.window.setStatusBarMessage(`$(copy) Copied ${endpoint.path}`, 3000);
        }
      },
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.refreshApiExplorer', () =>
      catalog.reload(),
    ),
  ];
}

async function resolveEndpoint(
  catalog: EndpointCatalog,
  arg: EndpointArg,
  title: string,
): Promise<Endpoint | undefined> {
  if (typeof arg === 'string') {
    return catalog.get(arg);
  }
  if (arg?.kind === 'endpoint') {
    return arg.endpoint;
  }
  const picked = await vscode.window.showQuickPick(
    catalog.all().map((endpoint) => ({
      label: endpoint.name,
      description: endpoint.method,
      detail: endpoint.path,
      endpoint,
    })),
    { title, placeHolder: 'Search endpoints by name or path', matchOnDetail: true },
  );
  return picked?.endpoint;
}

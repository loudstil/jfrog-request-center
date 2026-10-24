import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Endpoint, EndpointGroup, HttpMethod } from '../../shared/endpoints';
import type { EndpointCatalog, SpecSource } from '../explorer/endpointCatalog';

export type ApiExplorerNode =
  | { kind: 'spec'; source: SpecSource }
  | { kind: 'group'; group: EndpointGroup; parentId: string }
  | { kind: 'endpoint'; endpoint: Endpoint };

const METHOD_ICONS: Record<HttpMethod, [icon: string, color: string]> = {
  GET: ['arrow-down', 'charts.green'],
  HEAD: ['arrow-down', 'charts.green'],
  POST: ['add', 'charts.yellow'],
  PUT: ['arrow-up', 'charts.blue'],
  PATCH: ['edit', 'charts.purple'],
  DELETE: ['trash', 'charts.red'],
};

/** The "API Explorer" tree: built-in groups, then one node per OpenAPI spec from the settings. */
export class ApiExplorerProvider
  implements vscode.TreeDataProvider<ApiExplorerNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly catalog: EndpointCatalog) {
    this.subscription = catalog.onDidChange(() => this.changeEmitter.fire());
  }

  getChildren(node?: ApiExplorerNode): ApiExplorerNode[] {
    if (!node) {
      return [
        ...this.catalog.builtinGroups.map((group) => ({
          kind: 'group' as const,
          group,
          parentId: 'builtin',
        })),
        ...this.catalog.specSources.map((source) => ({ kind: 'spec' as const, source })),
      ];
    }
    if (node.kind === 'spec' && node.source.kind === 'spec') {
      return node.source.groups.map((group) => ({
        kind: 'group' as const,
        group,
        parentId: node.source.file,
      }));
    }
    if (node.kind === 'group') {
      return node.group.endpoints.map((endpoint) => ({ kind: 'endpoint' as const, endpoint }));
    }
    return [];
  }

  getTreeItem(node: ApiExplorerNode): vscode.TreeItem {
    switch (node.kind) {
      case 'spec':
        return specItem(node.source);
      case 'group': {
        const item = new vscode.TreeItem(
          node.group.name,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = `${node.parentId}/${node.group.name}`;
        item.description = `${node.group.endpoints.length}`;
        return item;
      }
      case 'endpoint':
        return endpointItem(node.endpoint);
    }
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}

function specItem(source: SpecSource): vscode.TreeItem {
  if (source.kind === 'error') {
    const item = new vscode.TreeItem(
      `Failed to load ${path.basename(source.file)}`,
      vscode.TreeItemCollapsibleState.None,
    );
    item.id = `spec-error:${source.file}`;
    item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
    item.tooltip = `${source.file}\n\n${source.message}`;
    item.description = source.message;
    return item;
  }
  const item = new vscode.TreeItem(source.title, vscode.TreeItemCollapsibleState.Collapsed);
  item.id = `spec:${source.file}`;
  item.iconPath = new vscode.ThemeIcon('file-code');
  item.description = path.basename(source.file);
  item.tooltip = source.file;
  return item;
}

function endpointItem(endpoint: Endpoint): vscode.TreeItem {
  const item = new vscode.TreeItem(endpoint.name, vscode.TreeItemCollapsibleState.None);
  const [icon, color] = METHOD_ICONS[endpoint.method];
  item.id = endpoint.id;
  item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
  item.description = endpoint.method;
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${endpoint.method}** `).appendCodeblock(endpoint.path);
  if (endpoint.description) {
    tooltip.appendText(endpoint.description);
  }
  item.tooltip = tooltip;
  item.contextValue = 'endpoint';
  // Clicking only opens the form; sending is always an explicit action.
  item.command = {
    command: 'jfrogRequestCenter.openRequestForm',
    title: 'Open Request Form',
    arguments: [endpoint.id],
  };
  return item;
}

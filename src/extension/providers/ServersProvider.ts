import * as vscode from 'vscode';
import type { ServerManager } from '../services/serverManager';
import type { ServerProfile } from '../services/serverProfiles';

/** The "Servers" tree: every configured server, with the active one marked. Click to switch. */
export class ServersProvider implements vscode.TreeDataProvider<ServerProfile>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly servers: ServerManager) {
    this.subscription = servers.onDidChange(() => this.changeEmitter.fire());
  }

  getChildren(element?: ServerProfile): ServerProfile[] {
    return element ? [] : this.servers.servers();
  }

  async getTreeItem(server: ServerProfile): Promise<vscode.TreeItem> {
    const active = this.servers.activeServer()?.name === server.name;
    const hasToken = Boolean(await this.servers.getToken(server.name));

    const item = new vscode.TreeItem(server.name, vscode.TreeItemCollapsibleState.None);
    item.id = `server:${server.name}`;
    item.description = [server.url, active ? 'active' : '', hasToken ? '' : 'no token']
      .filter(Boolean)
      .join(' · ');
    item.iconPath = active
      ? new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon(hasToken ? 'server' : 'key');
    item.tooltip = [
      server.name,
      server.url,
      server.username ? `User: ${server.username}` : 'Bearer token',
      hasToken ? undefined : 'No access token stored',
      active ? 'Active server' : 'Click to switch to this server',
    ]
      .filter(Boolean)
      .join('\n');
    item.contextValue = active ? 'server.active' : 'server';
    if (!active) {
      item.command = {
        command: 'jfrogRequestCenter.switchServer',
        title: 'Switch to Server',
        arguments: [server.name],
      };
    }
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}

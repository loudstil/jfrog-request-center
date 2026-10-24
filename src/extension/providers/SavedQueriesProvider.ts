import * as vscode from 'vscode';
import type { SavedQuery, SavedQueryStore } from '../services/savedQueryStore';

const DESCRIPTION_LENGTH = 60;

/** The "Saved Queries" tree in the JFrog sidebar. */
export class SavedQueriesProvider
  implements vscode.TreeDataProvider<SavedQuery>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private readonly subscription: { dispose(): void };

  constructor(private readonly store: SavedQueryStore) {
    this.subscription = store.onDidChange(() => this.changeEmitter.fire());
  }

  getChildren(element?: SavedQuery): SavedQuery[] {
    return element ? [] : this.store.list();
  }

  getTreeItem(saved: SavedQuery): vscode.TreeItem {
    const item = new vscode.TreeItem(saved.name, vscode.TreeItemCollapsibleState.None);
    item.id = saved.id;
    item.description = summarize(saved.query);
    item.tooltip = new vscode.MarkdownString(`**${escapeMarkdown(saved.name)}**`).appendCodeblock(
      saved.query,
    );
    item.iconPath = new vscode.ThemeIcon('search');
    item.contextValue = 'savedQuery';
    item.command = {
      command: 'jfrogRequestCenter.openSavedQuery',
      title: 'Open Saved Query',
      arguments: [saved.id],
    };
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}

function summarize(query: string): string {
  const oneLine = query.replace(/\s+/g, ' ').trim();
  return oneLine.length > DESCRIPTION_LENGTH ? `${oneLine.slice(0, DESCRIPTION_LENGTH)}…` : oneLine;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}

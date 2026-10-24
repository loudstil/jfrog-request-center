import * as vscode from 'vscode';
import type { SavedQueryRef } from '../../shared/messages';
import type { SavedQuery, SavedQueryStore } from '../services/savedQueryStore';
import { errorMessage } from '../errors';

/** What to show in the AQL Manager. */
export interface QueryToLoad {
  query: string;
  savedQuery: SavedQueryRef | undefined;
}

/** Tree items pass the SavedQuery, tree clicks pass its id, the Command Palette passes nothing. */
type SavedQueryArg = SavedQuery | string | undefined;

export function registerSavedQueryCommands(
  store: SavedQueryStore,
  openInAqlManager: (load: QueryToLoad) => Promise<void>,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('jfrogRequestCenter.newQuery', () =>
      openInAqlManager({ query: '', savedQuery: undefined }),
    ),
    vscode.commands.registerCommand(
      'jfrogRequestCenter.openSavedQuery',
      async (arg: SavedQueryArg) => {
        const saved = await resolveSavedQuery(store, arg, 'Open saved query');
        if (saved) {
          await openInAqlManager({ query: saved.query, savedQuery: toRef(saved) });
        }
      },
    ),
    vscode.commands.registerCommand(
      'jfrogRequestCenter.renameSavedQuery',
      async (arg: SavedQueryArg) => {
        const saved = await resolveSavedQuery(store, arg, 'Rename saved query');
        if (!saved) {
          return;
        }
        const name = await promptForQueryName(store, {
          title: `Rename "${saved.name}"`,
          value: saved.name,
          allowExistingId: saved.id,
        });
        if (name !== undefined && name !== saved.name) {
          await store.update(saved.id, { name }).catch(showError);
        }
      },
    ),
    vscode.commands.registerCommand(
      'jfrogRequestCenter.deleteSavedQuery',
      async (arg: SavedQueryArg) => {
        const saved = await resolveSavedQuery(store, arg, 'Delete saved query');
        if (!saved) {
          return;
        }
        const choice = await vscode.window.showWarningMessage(
          `Delete the saved query "${saved.name}"?`,
          { modal: true },
          'Delete',
        );
        if (choice === 'Delete') {
          await store.delete(saved.id);
        }
      },
    ),
  ];
}

/**
 * Asks for a query name. Unless `allowExistingId` names the query being renamed, an existing
 * name is accepted only after the user confirms overwriting it (see AqlPanel's save flow).
 */
export function promptForQueryName(
  store: SavedQueryStore,
  options: { title: string; value?: string; allowExistingId?: string },
): Thenable<string | undefined> {
  return vscode.window
    .showInputBox({
      title: options.title,
      prompt: 'Name for the saved query',
      value: options.value,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return 'Enter a name';
        }
        const existing = store.findByName(value);
        if (existing && existing.id !== options.allowExistingId) {
          return options.allowExistingId
            ? 'Another saved query already has this name'
            : {
                message: 'A saved query with this name exists and will be overwritten',
                severity: vscode.InputBoxValidationSeverity.Warning,
              };
        }
        return undefined;
      },
    })
    .then((name) => name?.trim());
}

export function toRef(saved: SavedQuery): SavedQueryRef {
  return { id: saved.id, name: saved.name };
}

async function resolveSavedQuery(
  store: SavedQueryStore,
  arg: SavedQueryArg,
  title: string,
): Promise<SavedQuery | undefined> {
  if (arg !== undefined) {
    const saved = store.get(typeof arg === 'string' ? arg : arg.id);
    if (!saved) {
      vscode.window.showWarningMessage('That saved query no longer exists.');
    }
    return saved;
  }

  const queries = store.list();
  if (!queries.length) {
    vscode.window.showInformationMessage(
      'There are no saved queries yet. Use Save in the AQL Manager to create one.',
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    queries.map((saved) => ({
      label: saved.name,
      detail: saved.query.replace(/\s+/g, ' ').trim(),
      saved,
    })),
    { title, placeHolder: 'Select a saved query', matchOnDetail: true },
  );
  return picked?.saved;
}

function showError(err: unknown): void {
  vscode.window.showErrorMessage(errorMessage(err));
}

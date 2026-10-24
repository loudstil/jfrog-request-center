import * as vscode from 'vscode';
import { errorMessage } from '../errors';
import { JFrogClient, normalizeBaseUrl, type RequestLogger } from '../services/jfrogClient';
import type { ServerManager } from '../services/serverManager';
import {
  defaultServerName,
  findServer,
  isHttpUrl,
  type ServerProfile,
  validateServerName,
} from '../services/serverProfiles';

/** Tree items pass the profile, other callers a name, the Command Palette nothing. */
type ServerArg = ServerProfile | string | undefined;

export function registerServerCommands(
  servers: ServerManager,
  logger: RequestLogger,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('jfrogRequestCenter.addServer', () =>
      editServerFlow(servers, logger, undefined),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.editServer', async (arg: ServerArg) => {
      const server = await resolveServer(servers, arg, 'Edit server');
      if (server) {
        await editServerFlow(servers, logger, server);
      }
    }),
    // Kept for links and buttons that say "Configure Connection": edit the active server, or
    // add the first one.
    vscode.commands.registerCommand('jfrogRequestCenter.configure', () =>
      editServerFlow(servers, logger, servers.activeServer()),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.switchServer', (arg: ServerArg) =>
      switchServer(servers, logger, arg),
    ),
    vscode.commands.registerCommand('jfrogRequestCenter.removeServer', async (arg: ServerArg) => {
      const server = await resolveServer(servers, arg, 'Remove server');
      if (!server) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Remove the server "${server.name}"?`,
        { modal: true, detail: `${server.url}\n\nIts stored access token is deleted too.` },
        'Remove',
      );
      if (choice === 'Remove') {
        await servers.removeServer(server.name);
      }
    }),
    vscode.commands.registerCommand(
      'jfrogRequestCenter.clearCredentials',
      async (arg: ServerArg) => {
        const server =
          arg === undefined ? servers.activeServer() : await resolveServer(servers, arg, '');
        if (!server) {
          vscode.window.showInformationMessage('No JFrog server is configured.');
          return;
        }
        const choice = await vscode.window.showWarningMessage(
          `Remove the stored access token for "${server.name}"?`,
          { modal: true },
          'Remove',
        );
        if (choice === 'Remove') {
          await servers.clearToken(server.name);
          vscode.window.showInformationMessage(`Access token for "${server.name}" removed.`);
        }
      },
    ),
  ];
}

/**
 * Switches the active server. Without an argument, shows a picker that can also add or edit
 * servers. Switching to a server without a token asks for one.
 */
async function switchServer(
  servers: ServerManager,
  logger: RequestLogger,
  arg: ServerArg,
): Promise<void> {
  let target: ServerProfile | undefined;
  if (arg !== undefined) {
    target = findServer(servers.servers(), typeof arg === 'string' ? arg : arg.name);
  } else {
    const active = servers.activeServer();
    type Item = vscode.QuickPickItem & { action: () => Promise<unknown> };
    const items: Item[] = [];
    for (const server of servers.servers()) {
      const isActive = server.name === active?.name;
      const hasToken = Boolean(await servers.getToken(server.name));
      items.push({
        label: `${isActive ? '$(check)' : '$(server)'} ${server.name}`,
        description: server.url,
        detail: hasToken ? undefined : 'No access token: you will be asked for one',
        action: async () => (target = server),
      });
    }
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, action: async () => {} });
    if (active) {
      items.push({
        label: `$(edit) Edit "${active.name}"…`,
        action: () => editServerFlow(servers, logger, active),
      });
    }
    items.push({
      label: '$(add) Add Server…',
      action: () => editServerFlow(servers, logger, undefined),
    });

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Switch JFrog Server',
      placeHolder: active ? `Active: ${active.name}` : 'No servers yet',
      matchOnDescription: true,
    });
    await picked?.action();
  }

  if (!target) {
    return;
  }
  await servers.setActive(target.name);
  if (!(await servers.getToken(target.name))) {
    await editServerFlow(servers, logger, target);
  }
}

/** Adds a server (`existing` undefined) or edits one: URL, name, username, token, then verify. */
async function editServerFlow(
  servers: ServerManager,
  logger: RequestLogger,
  existing: ServerProfile | undefined,
): Promise<boolean> {
  const title = existing ? `Edit Server "${existing.name}"` : 'Add JFrog Server';
  const currentToken = existing ? await servers.getToken(existing.name) : undefined;

  const rawUrl = await vscode.window.showInputBox({
    title: `${title} (1/4)`,
    prompt: 'JFrog Platform URL',
    placeHolder: 'https://mycompany.jfrog.io',
    value: existing?.url ?? '',
    ignoreFocusOut: true,
    validateInput: (value) => (isHttpUrl(value) ? undefined : 'Enter an http:// or https:// URL'),
  });
  if (rawUrl === undefined) {
    return false;
  }
  const url = normalizeBaseUrl(rawUrl);

  const name = await vscode.window.showInputBox({
    title: `${title} (2/4)`,
    prompt: 'A name to recognize this server by, e.g. "Production"',
    value: existing?.name ?? defaultServerName(url),
    ignoreFocusOut: true,
    validateInput: (value) => validateServerName(value, servers.servers(), existing?.name),
  });
  if (name === undefined) {
    return false;
  }

  const username = await vscode.window.showInputBox({
    title: `${title} (3/4)`,
    prompt: 'Username (optional). Leave empty to send the access token as a Bearer token.',
    value: existing?.username ?? '',
    ignoreFocusOut: true,
  });
  if (username === undefined) {
    return false;
  }

  const enteredToken = await vscode.window.showInputBox({
    title: `${title} (4/4)`,
    prompt: currentToken
      ? 'Access token. Leave empty to keep the current one.'
      : 'Access token (or password/API key when a username is set)',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() || currentToken ? undefined : 'An access token is required',
  });
  if (enteredToken === undefined) {
    return false;
  }

  const profile: ServerProfile = {
    name: name.trim(),
    url,
    username: username.trim() || undefined,
  };
  const token = enteredToken.trim() || currentToken!;

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Verifying "${profile.name}"…` },
      () => JFrogClient.forConnection({ ...profile, baseUrl: url, token }, { logger }).ping(),
    );
  } catch (err) {
    const choice = await vscode.window.showErrorMessage(
      `Could not verify "${profile.name}": ${errorMessage(err)}`,
      'Retry',
      'Save Anyway',
    );
    if (choice === 'Retry') {
      return editServerFlow(servers, logger, existing);
    }
    if (choice !== 'Save Anyway') {
      return false;
    }
  }

  await servers.saveServer(profile, enteredToken.trim() || undefined, existing?.name);
  if (!existing) {
    // A newly added server is almost always the one the user wants to use next.
    await servers.setActive(profile.name);
    vscode.window.showInformationMessage(`Added "${profile.name}" and switched to it.`);
  } else {
    vscode.window.showInformationMessage(`Saved "${profile.name}".`);
  }
  return true;
}

async function resolveServer(
  servers: ServerManager,
  arg: ServerArg,
  title: string,
): Promise<ServerProfile | undefined> {
  if (arg !== undefined) {
    const server = findServer(servers.servers(), typeof arg === 'string' ? arg : arg.name);
    if (!server) {
      vscode.window.showWarningMessage('That server no longer exists.');
    }
    return server;
  }
  const all = servers.servers();
  if (!all.length) {
    vscode.window.showInformationMessage('No JFrog servers yet. Use "Add Server" first.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    all.map((server) => ({ label: server.name, description: server.url, server })),
    { title, placeHolder: 'Select a server' },
  );
  return picked?.server;
}

import * as vscode from 'vscode';
import { type AuthService, CONFIG_SECTION } from '../services/authService';
import { type Connection, JFrogClient, normalizeBaseUrl } from '../services/jfrogClient';

const TITLE = 'JFrog: Configure Connection';

/** Prompts for URL, optional username and token, verifies them with a ping, then saves. */
export async function configureConnection(auth: AuthService): Promise<boolean> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  const baseUrl = await vscode.window.showInputBox({
    title: `${TITLE} (1/3)`,
    prompt: 'JFrog Platform URL',
    placeHolder: 'https://mycompany.jfrog.io',
    value: config.get<string>('platformUrl') ?? '',
    ignoreFocusOut: true,
    validateInput: (value) => (isHttpUrl(value) ? undefined : 'Enter an http:// or https:// URL'),
  });
  if (baseUrl === undefined) {
    return false;
  }

  const username = await vscode.window.showInputBox({
    title: `${TITLE} (2/3)`,
    prompt: 'Username (optional). Leave empty to send the access token as a Bearer token.',
    value: config.get<string>('username') ?? '',
    ignoreFocusOut: true,
  });
  if (username === undefined) {
    return false;
  }

  const token = await vscode.window.showInputBox({
    title: `${TITLE} (3/3)`,
    prompt: 'Access token (or password/API key when a username is set)',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() ? undefined : 'A token is required'),
  });
  if (token === undefined) {
    return false;
  }

  const connection: Connection = {
    baseUrl: normalizeBaseUrl(baseUrl),
    username: username.trim() || undefined,
    token: token.trim(),
  };

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Verifying JFrog connection…' },
      () => JFrogClient.forConnection(connection).ping(),
    );
  } catch (err) {
    const choice = await vscode.window.showErrorMessage(
      `Could not verify the connection: ${errorMessage(err)}`,
      'Retry',
      'Save Anyway',
    );
    if (choice === 'Retry') {
      return configureConnection(auth);
    }
    if (choice !== 'Save Anyway') {
      return false;
    }
  }

  await auth.save(connection);
  vscode.window.showInformationMessage(`JFrog connection saved for ${connection.baseUrl}.`);
  return true;
}

export async function clearCredentials(auth: AuthService): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    'Remove the stored JFrog access token?',
    { modal: true },
    'Remove',
  );
  if (choice === 'Remove') {
    await auth.clear();
    vscode.window.showInformationMessage('JFrog access token removed.');
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value.trim());
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

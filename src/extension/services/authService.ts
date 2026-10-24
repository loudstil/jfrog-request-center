import * as vscode from 'vscode';
import { type Connection, normalizeBaseUrl } from './jfrogClient';

export const CONFIG_SECTION = 'jfrogRequestCenter';
const TOKEN_SECRET_KEY = 'jfrogRequestCenter.accessToken';

/**
 * Owns the JFrog connection details. The URL and username are ordinary settings;
 * the token lives only in VS Code's SecretStorage (the OS keychain).
 */
export class AuthService implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private readonly disposables: vscode.Disposable[] = [this.changeEmitter];

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.disposables.push(
      secrets.onDidChange((e) => {
        if (e.key === TOKEN_SECRET_KEY) {
          this.changeEmitter.fire();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
          this.changeEmitter.fire();
        }
      }),
    );
  }

  /** The full connection, or undefined if the URL or token is missing. */
  async getConnection(): Promise<Connection | undefined> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const baseUrl = config.get<string>('platformUrl')?.trim();
    const token = await this.secrets.get(TOKEN_SECRET_KEY);
    if (!baseUrl || !token) {
      return undefined;
    }
    const username = config.get<string>('username')?.trim() || undefined;
    return { baseUrl: normalizeBaseUrl(baseUrl), username, token };
  }

  async save(connection: Connection): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update('platformUrl', connection.baseUrl, vscode.ConfigurationTarget.Global);
    await config.update('username', connection.username ?? '', vscode.ConfigurationTarget.Global);
    await this.secrets.store(TOKEN_SECRET_KEY, connection.token);
  }

  /** Removes the token. The URL and username are kept so reconfiguring is quicker. */
  async clear(): Promise<void> {
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

import * as vscode from 'vscode';
import type { Connection } from './jfrogClient';
import {
  findServer,
  legacyProfile,
  pickActive,
  readServerProfiles,
  removeServer,
  type ServerProfile,
  tokenSecretKey,
  toSetting,
  upsertServer,
} from './serverProfiles';

export const CONFIG_SECTION = 'jfrogRequestCenter';
const SERVERS_SETTING = 'servers';
const ACTIVE_SERVER_KEY = 'jfrogRequestCenter.activeServer';
const TOKEN_KEY_PREFIX = 'jfrogRequestCenter.token.';
// Pre-0.1 single connection, migrated on activation.
const LEGACY_TOKEN_KEY = 'jfrogRequestCenter.accessToken';

/**
 * The JFrog servers the user can switch between. Profiles (name, URL, username) live in the
 * `jfrogRequestCenter.servers` setting, so teams can share them per workspace; each server's
 * token lives only in SecretStorage (the OS keychain). The active server is remembered globally.
 */
export class ServerManager implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  /** Fires when the server list, the active server, or any server's token changes. */
  readonly onDidChange = this.changeEmitter.event;
  private readonly disposables: vscode.Disposable[] = [this.changeEmitter];

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState: vscode.Memento,
  ) {
    this.disposables.push(
      secrets.onDidChange((e) => {
        if (e.key.startsWith(TOKEN_KEY_PREFIX)) {
          this.changeEmitter.fire();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`${CONFIG_SECTION}.${SERVERS_SETTING}`)) {
          this.changeEmitter.fire();
        }
      }),
    );
  }

  servers(): ServerProfile[] {
    return readServerProfiles(this.config().get(SERVERS_SETTING));
  }

  activeServer(): ServerProfile | undefined {
    return pickActive(this.servers(), this.globalState.get<string>(ACTIVE_SERVER_KEY));
  }

  /** The active server with its token, or undefined if there's no server or no token. */
  async getConnection(): Promise<Connection | undefined> {
    const server = this.activeServer();
    const token = server && (await this.getToken(server.name));
    return server && token
      ? { name: server.name, baseUrl: server.url, username: server.username, token }
      : undefined;
  }

  getToken(name: string): Thenable<string | undefined> {
    return this.secrets.get(tokenSecretKey(name));
  }

  async setActive(name: string): Promise<void> {
    await this.globalState.update(ACTIVE_SERVER_KEY, findServer(this.servers(), name)?.name);
    this.changeEmitter.fire();
  }

  /**
   * Adds a server, or updates the one named `previousName` (which may be a rename). A missing
   * `token` keeps the existing one.
   */
  async saveServer(
    profile: ServerProfile,
    token: string | undefined,
    previousName?: string,
  ): Promise<void> {
    const oldKey = previousName === undefined ? undefined : tokenSecretKey(previousName);
    const newKey = tokenSecretKey(profile.name);
    // Checked before writing: after a rename the old name no longer matches any server.
    const active = this.activeServer();
    const wasActive =
      oldKey !== undefined && active !== undefined && tokenSecretKey(active.name) === oldKey;
    const keptToken =
      token ?? (previousName === undefined ? undefined : await this.getToken(previousName));

    await this.writeServers(upsertServer(this.servers(), profile, previousName));
    if (keptToken) {
      await this.secrets.store(newKey, keptToken);
    }
    if (oldKey !== undefined && oldKey !== newKey) {
      await this.secrets.delete(oldKey);
    }
    if (wasActive) {
      await this.globalState.update(ACTIVE_SERVER_KEY, profile.name);
    }
    this.changeEmitter.fire();
  }

  async removeServer(name: string): Promise<void> {
    const wasActive = this.activeServer()?.name === findServer(this.servers(), name)?.name;
    await this.writeServers(removeServer(this.servers(), name));
    if (wasActive) {
      // Forget it, so a future server with the same name doesn't silently become active.
      await this.globalState.update(ACTIVE_SERVER_KEY, undefined);
    }
    await this.secrets.delete(tokenSecretKey(name));
    this.changeEmitter.fire();
  }

  async clearToken(name: string): Promise<void> {
    await this.secrets.delete(tokenSecretKey(name));
  }

  /** Turns the pre-0.1 single connection (platformUrl/username + token) into a server profile. */
  async migrateLegacyConnection(): Promise<void> {
    const config = this.config();
    const legacy = legacyProfile(config.get<string>('platformUrl'), config.get<string>('username'));
    if (!legacy || this.servers().length) {
      return;
    }
    const token = await this.secrets.get(LEGACY_TOKEN_KEY);
    await this.saveServer(legacy, token);
    await this.setActive(legacy.name);
    await this.secrets.delete(LEGACY_TOKEN_KEY);
    await config.update('platformUrl', undefined, vscode.ConfigurationTarget.Global);
    await config.update('username', undefined, vscode.ConfigurationTarget.Global);
  }

  /**
   * Writes where the list is currently defined, so editing a team's workspace list doesn't
   * create a user-level copy that the workspace one would hide.
   */
  private async writeServers(servers: ServerProfile[]): Promise<void> {
    const inspected = this.config().inspect(SERVERS_SETTING);
    const target =
      inspected?.workspaceFolderValue !== undefined
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : inspected?.workspaceValue !== undefined
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
    await this.config().update(SERVERS_SETTING, servers.map(toSetting), target);
  }

  private config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}

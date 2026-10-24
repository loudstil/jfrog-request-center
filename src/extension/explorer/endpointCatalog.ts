import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';
import type { Endpoint, EndpointGroup } from '../../shared/endpoints';
import { errorMessage } from '../commands/connection';
import { CONFIG_SECTION } from '../services/authService';
import { BUILTIN_CATALOG } from './builtinCatalog';
import { parseOpenApi } from './openApi';

/** One OpenAPI file from the `openApiSpecs` setting, loaded or failed. */
export type SpecSource =
  | { kind: 'spec'; file: string; title: string; groups: EndpointGroup[] }
  | { kind: 'error'; file: string; message: string };

/** The endpoints shown in the API Explorer: the built-in catalog plus user-supplied specs. */
export class EndpointCatalog implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private readonly subscription: vscode.Disposable;
  private specs: SpecSource[] = [];
  private byId = new Map<string, Endpoint>();

  constructor() {
    this.index();
    this.subscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${CONFIG_SECTION}.openApiSpecs`)) {
        void this.reload();
      }
    });
  }

  get builtinGroups(): EndpointGroup[] {
    return BUILTIN_CATALOG;
  }

  get specSources(): SpecSource[] {
    return this.specs;
  }

  get(id: string): Endpoint | undefined {
    return this.byId.get(id);
  }

  all(): Endpoint[] {
    return [...this.byId.values()];
  }

  /** (Re)reads the spec files listed in the settings. */
  async reload(): Promise<void> {
    const files =
      vscode.workspace.getConfiguration(CONFIG_SECTION).get<string[]>('openApiSpecs') ?? [];
    this.specs = await Promise.all(files.filter((f) => f.trim()).map(loadSpec));
    this.index();
    this.changeEmitter.fire();
  }

  private index(): void {
    const groups = [
      ...BUILTIN_CATALOG,
      ...this.specs.flatMap((s) => (s.kind === 'spec' ? s.groups : [])),
    ];
    this.byId = new Map(groups.flatMap((g) => g.endpoints).map((e) => [e.id, e]));
  }

  dispose(): void {
    this.subscription.dispose();
    this.changeEmitter.dispose();
  }
}

async function loadSpec(setting: string): Promise<SpecSource> {
  const file = resolveSpecPath(setting.trim());
  try {
    // YAML is a superset of JSON, so one parser handles both formats.
    const document: unknown = parseYaml(await readFile(file, 'utf8'));
    const { title, groups } = parseOpenApi(document, file);
    return { kind: 'spec', file, title, groups };
  } catch (err) {
    return { kind: 'error', file, message: errorMessage(err) };
  }
}

/** Supports absolute paths, `~/...`, and paths relative to the first workspace folder. */
function resolveSpecPath(file: string): string {
  if (file === '~' || file.startsWith('~/')) {
    return path.join(homedir(), file.slice(1));
  }
  if (path.isAbsolute(file)) {
    return file;
  }
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return workspace ? path.join(workspace, file) : path.resolve(file);
}

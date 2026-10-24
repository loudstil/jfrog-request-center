// Persists saved AQL queries. Depends only on a Memento-like interface (VS Code's globalState
// satisfies it), so it can be unit-tested without VS Code.
import { randomUUID } from 'node:crypto';

export const SAVED_QUERIES_KEY = 'jfrogRequestCenter.savedQueries';

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  updatedAt: number;
}

export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export class SavedQueryStore {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: KeyValueStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** All saved queries, sorted by name. */
  list(): SavedQuery[] {
    return [...this.read()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }

  get(id: string): SavedQuery | undefined {
    return this.read().find((q) => q.id === id);
  }

  /** Names are unique, ignoring case and surrounding whitespace. */
  findByName(name: string): SavedQuery | undefined {
    const key = normalizeName(name);
    return this.read().find((q) => normalizeName(q.name) === key);
  }

  async create(name: string, query: string): Promise<SavedQuery> {
    if (this.findByName(name)) {
      throw new Error(`A saved query named "${name.trim()}" already exists.`);
    }
    const saved: SavedQuery = { id: randomUUID(), name: name.trim(), query, updatedAt: this.now() };
    await this.write([...this.read(), saved]);
    return saved;
  }

  async update(
    id: string,
    changes: Partial<Pick<SavedQuery, 'name' | 'query'>>,
  ): Promise<SavedQuery> {
    const existing = this.get(id);
    if (!existing) {
      throw new Error('That saved query no longer exists.');
    }
    if (changes.name !== undefined) {
      const clash = this.findByName(changes.name);
      if (clash && clash.id !== id) {
        throw new Error(`A saved query named "${changes.name.trim()}" already exists.`);
      }
    }
    const updated: SavedQuery = {
      ...existing,
      ...changes,
      name: (changes.name ?? existing.name).trim(),
      updatedAt: this.now(),
    };
    await this.write(this.read().map((q) => (q.id === id ? updated : q)));
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.write(this.read().filter((q) => q.id !== id));
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private read(): SavedQuery[] {
    return this.storage.get<SavedQuery[]>(SAVED_QUERIES_KEY) ?? [];
  }

  private async write(queries: SavedQuery[]): Promise<void> {
    await this.storage.update(SAVED_QUERIES_KEY, queries);
    this.listeners.forEach((listener) => listener());
  }
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

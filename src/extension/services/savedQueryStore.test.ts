import { describe, expect, it, vi } from 'vitest';
import { type KeyValueStore, SAVED_QUERIES_KEY, SavedQueryStore } from './savedQueryStore';

function createStore() {
  const data = new Map<string, unknown>();
  const storage: KeyValueStore = {
    get: <T>(key: string) => data.get(key) as T | undefined,
    update: async (key, value) => void data.set(key, value),
  };
  let time = 1000;
  const store = new SavedQueryStore(storage, () => time++);
  return { store, data };
}

describe('SavedQueryStore', () => {
  it('starts empty', () => {
    expect(createStore().store.list()).toEqual([]);
  });

  it('creates queries and persists them', async () => {
    const { store, data } = createStore();
    const saved = await store.create('  Jars  ', 'items.find({})');

    expect(saved).toMatchObject({ name: 'Jars', query: 'items.find({})', updatedAt: 1000 });
    expect(saved.id).toBeTruthy();
    expect(store.get(saved.id)).toEqual(saved);
    expect(data.get(SAVED_QUERIES_KEY)).toEqual([saved]);
  });

  it('lists queries sorted by name, ignoring case', async () => {
    const { store } = createStore();
    await store.create('beta', 'q');
    await store.create('Alpha', 'q');
    await store.create('gamma', 'q');
    expect(store.list().map((q) => q.name)).toEqual(['Alpha', 'beta', 'gamma']);
  });

  it('rejects duplicate names, ignoring case and whitespace', async () => {
    const { store } = createStore();
    await store.create('Jars', 'q');
    await expect(store.create(' jars ', 'q')).rejects.toThrow('already exists');
    expect(store.findByName('JARS ')?.name).toBe('Jars');
  });

  it('updates the query text and timestamp', async () => {
    const { store } = createStore();
    const saved = await store.create('Jars', 'old');
    const updated = await store.update(saved.id, { query: 'new' });

    expect(updated).toMatchObject({ id: saved.id, name: 'Jars', query: 'new', updatedAt: 1001 });
    expect(store.list()).toEqual([updated]);
  });

  it('renames, but not onto another query name', async () => {
    const { store } = createStore();
    const a = await store.create('A', 'q');
    await store.create('B', 'q');

    expect((await store.update(a.id, { name: ' a renamed ' })).name).toBe('a renamed');
    await expect(store.update(a.id, { name: 'b' })).rejects.toThrow('already exists');
    // Changing only the case of its own name is fine.
    expect((await store.update(a.id, { name: 'A RENAMED' })).name).toBe('A RENAMED');
  });

  it('fails to update a query that was deleted', async () => {
    const { store } = createStore();
    const saved = await store.create('Jars', 'q');
    await store.delete(saved.id);

    expect(store.list()).toEqual([]);
    await expect(store.update(saved.id, { query: 'x' })).rejects.toThrow('no longer exists');
  });

  it('notifies listeners on every change until disposed', async () => {
    const { store } = createStore();
    const listener = vi.fn();
    const subscription = store.onDidChange(listener);

    const saved = await store.create('Jars', 'q');
    await store.update(saved.id, { query: 'x' });
    await store.delete(saved.id);
    expect(listener).toHaveBeenCalledTimes(3);

    subscription.dispose();
    await store.create('Other', 'q');
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

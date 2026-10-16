/** In-memory stand-in for `react-native-mmkv`; stores are shared by id like the real module. */
const stores = new Map<string, Map<string, string>>();

export function createMMKV({ id }: { id: string }) {
  const data = stores.get(id) ?? new Map<string, string>();
  stores.set(id, data);
  return {
    getString: (key: string) => data.get(key),
    set: (key: string, value: string) => {
      data.set(key, value);
    },
    remove: (key: string) => data.delete(key),
    contains: (key: string) => data.has(key),
    clearAll: () => data.clear(),
    getAllKeys: () => [...data.keys()],
  };
}

export function resetMockMmkv(): void {
  stores.forEach((data) => data.clear());
}

export function existsMMKV(id: string): boolean {
  return stores.has(id);
}

export function deleteMMKV(id: string): boolean {
  return stores.delete(id);
}

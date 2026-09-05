export class IdempotencyStore<T> {
  private readonly entries: Map<string, T>;

  constructor() {
    this.entries = new Map<string, T>();
  }

  get(key: string): T | undefined {
    return this.entries.get(key.trim());
  }

  set(key: string, value: T): void {
    this.entries.set(key.trim(), value);
  }
}

export async function withIdempotency<T>(
  store: IdempotencyStore<T>,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = store.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const result = await fn();
  store.set(key, result);
  return result;
}

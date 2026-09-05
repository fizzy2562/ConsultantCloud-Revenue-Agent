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

const inFlightByStore = new WeakMap<object, Map<string, Promise<unknown>>>();

export async function withIdempotency<T>(
  store: IdempotencyStore<T>,
  key: string,
  fn: () => Promise<T>,
  isCacheable: (result: T) => boolean = () => true
): Promise<T> {
  const existing = store.get(key);
  if (existing !== undefined) {
    return existing;
  }

  let inFlight = inFlightByStore.get(store);
  if (!inFlight) {
    inFlight = new Map<string, Promise<unknown>>();
    inFlightByStore.set(store, inFlight);
  }

  const normalizedKey = key.trim();
  const pending = inFlight.get(normalizedKey) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const operation = Promise.resolve()
    .then(fn)
    .then((result) => {
      if (isCacheable(result)) {
        store.set(normalizedKey, result);
      }
      return result;
    })
    .finally(() => {
      inFlight?.delete(normalizedKey);
    });

  inFlight.set(normalizedKey, operation);
  return operation;
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key "${key}" was reused with a different request payload`);
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyStore<T> {
  private readonly entries: Map<string, T>;
  private readonly fingerprints: Map<string, string>;

  constructor() {
    this.entries = new Map<string, T>();
    this.fingerprints = new Map<string, string>();
  }

  get(key: string): T | undefined {
    return this.entries.get(key.trim());
  }

  set(key: string, value: T, fingerprint: string): void {
    const normalized = key.trim();
    this.entries.set(normalized, value);
    this.fingerprints.set(normalized, fingerprint);
  }

  fingerprintFor(key: string): string | undefined {
    return this.fingerprints.get(key.trim());
  }
}

const inFlightByStore = new WeakMap<object, Map<string, Promise<unknown>>>();
const inFlightFingerprintsByStore = new WeakMap<object, Map<string, string>>();

export async function withIdempotency<T>(
  store: IdempotencyStore<T>,
  key: string,
  fingerprint: string,
  fn: () => Promise<T>,
  isCacheable: (result: T) => boolean = () => true
): Promise<T> {
  const normalizedKey = key.trim();

  const cachedFingerprint = store.fingerprintFor(normalizedKey);
  if (cachedFingerprint !== undefined && cachedFingerprint !== fingerprint) {
    throw new IdempotencyConflictError(normalizedKey);
  }

  const existing = store.get(normalizedKey);
  if (existing !== undefined) {
    return existing;
  }

  let inFlight = inFlightByStore.get(store);
  if (!inFlight) {
    inFlight = new Map<string, Promise<unknown>>();
    inFlightByStore.set(store, inFlight);
  }
  let inFlightFingerprints = inFlightFingerprintsByStore.get(store);
  if (!inFlightFingerprints) {
    inFlightFingerprints = new Map<string, string>();
    inFlightFingerprintsByStore.set(store, inFlightFingerprints);
  }

  const pendingFingerprint = inFlightFingerprints.get(normalizedKey);
  if (pendingFingerprint !== undefined && pendingFingerprint !== fingerprint) {
    throw new IdempotencyConflictError(normalizedKey);
  }

  const pending = inFlight.get(normalizedKey) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  inFlightFingerprints.set(normalizedKey, fingerprint);

  const operation = Promise.resolve()
    .then(fn)
    .then((result) => {
      if (isCacheable(result)) {
        store.set(normalizedKey, result, fingerprint);
      }
      return result;
    })
    .finally(() => {
      inFlight?.delete(normalizedKey);
      inFlightFingerprints?.delete(normalizedKey);
    });

  inFlight.set(normalizedKey, operation);
  return operation;
}

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type RateLimitState = {
  count: number;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();

const getNow = () => Date.now();

const readEntry = <T>(key: string, now = getNow()) => {
  const entry = cacheStore.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    cacheStore.delete(key);
    return null;
  }

  return entry;
};

export const getCached = async <T>(key: string): Promise<T | null> => {
  const entry = readEntry<T>(key);
  return entry ? entry.value : null;
};

export const setCached = async <T>(key: string, value: T, ttlSeconds: number) => {
  cacheStore.set(key, {
    value,
    expiresAt: getNow() + ttlSeconds * 1000
  });
};

export const deleteCached = async (key: string) => {
  cacheStore.delete(key);
};

export const consumeRateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number
) => {
  const now = getNow();
  const existingEntry = readEntry<RateLimitState>(key, now);
  const entry = existingEntry ?? {
    value: {
      count: 0
    },
    expiresAt: now + windowSeconds * 1000
  };

  entry.value.count += 1;
  cacheStore.set(key, entry);

  const allowed = entry.value.count <= limit;
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));

  return {
    allowed,
    retryAfterSeconds,
    remaining: Math.max(0, limit - entry.value.count)
  };
};

export const clearCache = () => {
  cacheStore.clear();
};

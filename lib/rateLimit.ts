type Key = string;

type Counter = {
  tokens: number;
  lastRefill: number; // ms epoch
};

const buckets = new Map<Key, Counter>();

export function rateLimit(options: { key: Key; capacity: number; refillPerSec: number }) {
  const now = Date.now();
  const sec = 1000;
  const { key, capacity, refillPerSec } = options;
  const refillInterval = sec / Math.max(refillPerSec, 1);
  const counter = buckets.get(key) || { tokens: capacity, lastRefill: now };

  if (now - counter.lastRefill >= refillInterval) {
    const elapsed = now - counter.lastRefill;
    const tokensToAdd = Math.floor(elapsed / refillInterval);
    counter.tokens = Math.min(capacity, counter.tokens + tokensToAdd);
    counter.lastRefill = now;
  }

  if (counter.tokens > 0) {
    counter.tokens -= 1;
    buckets.set(key, counter);
    return { ok: true } as const;
  } else {
    buckets.set(key, counter);
    return { ok: false } as const;
  }
}

